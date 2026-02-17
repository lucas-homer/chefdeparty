/**
 * Shared utilities for party wizard step handlers.
 * Extracts common functionality from the /chat endpoint.
 */

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { UIMessageStreamWriter } from "ai";
import {
  wizardSessions,
  wizardMessages,
  type SerializedUIMessage,
} from "../../../drizzle/schema";
import {
  deserializeWizardSession,
  type DeserializedWizardSession,
} from "../wizard-session-serialization";
import type { WizardMessage, StepConfirmationRequest } from "../wizard-message-types";
import type { WizardStep, WizardState } from "../wizard-schemas";
import type { Env } from "../../index";
import type { createDb } from "../db";
import { flushLangfuse, type LangfuseTraceClient } from "../langfuse";
import { flushLangfuseTelemetry, getLangfuseTelemetryTracer } from "../otel";

// ============================================
// Types
// ============================================

export interface ConfirmationDecision {
  requestId: string;
  decision:
    | { type: "approve" }
    | { type: "revise"; feedback: string };
}

export interface WizardTelemetryContext {
  traceId: string;
  sessionId: string;
  userId: string;
  step: WizardStep;
  environment: string;
  traceClient?: LangfuseTraceClient;
}

interface SilentModelCompletionInput {
  finishReason?: string;
  responseText?: string;
  usage?: { outputTokens?: unknown } | null;
  toolCalls?: unknown[];
  toolResults?: unknown[];
}

export interface HandlerContext {
  db: ReturnType<typeof createDb>;
  user: { id: string };
  env: Env;
  session: DeserializedWizardSession;
  sessionId: string;
  step: WizardStep;
  currentData: Partial<WizardState>;
  existingMessages: SerializedUIMessage[];
  incomingMessage: {
    id: string;
    parts: Array<Record<string, unknown>>;
    textContent: string;
    hasImage: boolean;
  };
  referenceNow?: Date;
  confirmationDecision?: ConfirmationDecision;
  pendingConfirmationRequest?: StepConfirmationRequest;
  userRecipes?: Array<{ id: string; name: string; description: string | null }>;
  telemetry?: WizardTelemetryContext;
  debug?: {
    forceSilentFinishReason?: string;
  };
}

export type StepHandler = (ctx: HandlerContext) => Promise<Response>;

// ============================================
// Validation Schemas
// ============================================

export const confirmationDecisionSchema = z.object({
  requestId: z.string(),
  decision: z.union([
    z.object({ type: z.literal("approve") }),
    z.object({ type: z.literal("revise"), feedback: z.string() }),
  ]),
});

export const sessionChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.object({
    id: z.string().optional(),
    role: z.enum(["user", "assistant", "system"]),
    content: z.string().optional(),
    parts: z.array(z.any()).optional(),
    createdAt: z.string().optional(),
  }),
  confirmationDecision: confirmationDecisionSchema.optional(),
});

// ============================================
// Data Transformation Utilities
// ============================================

/**
 * Strip large binary data (images) from message parts before storing in DB.
 * D1/SQLite has a ~1MB limit for TEXT columns, and base64 images exceed this.
 */
export function stripLargeDataForStorage(parts: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return parts.map((part) => {
    // Replace image data with a placeholder
    if (part.type === "image" && part.image) {
      const image = part.image as string;
      return {
        type: "image",
        imageStripped: true,
        mimeType: typeof image === "string" && image.startsWith("data:")
          ? image.split(";")[0].replace("data:", "")
          : "image/unknown",
      };
    }
    // Handle file parts similarly
    if (part.type === "file" && part.data) {
      return {
        type: "file",
        fileStripped: true,
        mimeType: (part.mimeType as string) || "application/octet-stream",
        name: part.name,
      };
    }
    return part;
  });
}

function getTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeTokenCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "intValue" in value &&
    typeof (value as { intValue?: unknown }).intValue === "number"
  ) {
    return (value as { intValue: number }).intValue;
  }

  return undefined;
}

function hasRenderableToolOutput(part: Record<string, unknown>): boolean {
  const partType = String(part.type || "");
  const isToolPart = partType.startsWith("tool-") || partType === "dynamic-tool";
  if (!isToolPart) return false;

  const output = (part.output ?? part.result) as Record<string, unknown> | undefined;
  if (output) {
    if (getTrimmedString(output.message)) return true;
    if (getTrimmedString(output.error)) return true;
  }

  if (part.state === "output-error" && getTrimmedString(part.errorText)) {
    return true;
  }

  return false;
}

export function hasRenderableAssistantParts(parts: Array<Record<string, unknown>>): boolean {
  return parts.some((part) => {
    const partType = String(part.type || "");

    if (partType === "text" && getTrimmedString(part.text)) {
      return true;
    }

    if (
      partType === "data-session-refresh" ||
      partType === "data-step-confirmation-request" ||
      partType === "data-step-confirmation-decision" ||
      partType === "data-step-confirmed" ||
      partType === "data-recipe-extracted" ||
      partType === "data-timeline-generated"
    ) {
      return true;
    }

    if (partType === "tool-result") {
      const result = part.result as Record<string, unknown> | undefined;
      if (result && (getTrimmedString(result.message) || getTrimmedString(result.error))) {
        return true;
      }
    }

    return hasRenderableToolOutput(part);
  });
}

export function isSilentModelCompletion({
  responseText,
  usage,
  toolCalls,
  toolResults,
}: SilentModelCompletionInput): boolean {
  const hasText = Boolean(getTrimmedString(responseText));
  if (hasText) return false;

  const hasToolActivity = (toolCalls?.length || 0) > 0 || (toolResults?.length || 0) > 0;
  if (hasToolActivity) return false;

  const outputTokens = normalizeTokenCount(usage?.outputTokens);
  if (outputTokens !== undefined) {
    return outputTokens <= 0;
  }

  // If no text/tool activity was produced and output token counts are unavailable,
  // still treat this as silent so we can provide a fallback.
  return true;
}

export function getSilentCompletionFallbackMessage(finishReason?: string): string {
  if (finishReason === "content-filter") {
    return "I could not send a response because it was filtered. Please rephrase and I will continue.";
  }

  if (finishReason === "length") {
    return "My response got cut off before I could send it. Please send \"continue\" and I will pick up from here.";
  }

  return "I hit a temporary issue and did not send a usable response. I still received your message. Please send \"continue\" and I will keep going.";
}

// ============================================
// Session Loading Utilities
// ============================================

/**
 * Load a wizard session by ID, validating user ownership.
 */
export async function loadAndValidateSession(
  db: ReturnType<typeof createDb>,
  sessionId: string,
  userId: string
): Promise<DeserializedWizardSession | null> {
  const [session] = await db
    .select()
    .from(wizardSessions)
    .where(
      and(
        eq(wizardSessions.id, sessionId),
        eq(wizardSessions.userId, userId)
      )
    )
    .limit(1);

  if (!session) {
    return null;
  }

  return deserializeWizardSession(session);
}

/**
 * Load messages for a specific step from the database.
 */
export async function loadStepMessages(
  db: ReturnType<typeof createDb>,
  sessionId: string,
  step: WizardStep
): Promise<SerializedUIMessage[]> {
  const messages = await db
    .select()
    .from(wizardMessages)
    .where(
      and(
        eq(wizardMessages.sessionId, sessionId),
        eq(wizardMessages.step, step)
      )
    )
    .orderBy(wizardMessages.createdAt);

  return messages.map((m) => m.message);
}

/**
 * Save a user message to the database.
 */
export async function saveUserMessage(
  db: ReturnType<typeof createDb>,
  sessionId: string,
  step: WizardStep,
  message: SerializedUIMessage
): Promise<void> {
  await db.insert(wizardMessages).values({
    sessionId,
    step,
    message,
  });
}

/**
 * Save an assistant message to the database.
 */
export async function saveAssistantMessage(
  db: ReturnType<typeof createDb>,
  sessionId: string,
  step: WizardStep,
  message: SerializedUIMessage
): Promise<void> {
  await db.insert(wizardMessages).values({
    sessionId,
    step,
    message,
  });
}

// ============================================
// AI Model Utilities
// ============================================

/**
 * Create wrapped AI models with middleware for tool input examples.
 */
export async function createWrappedModels(env: Env) {
  const {
    wrapLanguageModel,
    addToolInputExamplesMiddleware,
  } = await import("ai");
  const { createAI } = await import("../ai");
  const {
    defaultModel: rawDefaultModel,
    visionModel: rawVisionModel,
    strongModel: rawStrongModel,
  } = createAI(env.GOOGLE_GENERATIVE_AI_API_KEY, {
    strongModel: env.WIZARD_STRONG_MODEL,
  });

  const defaultModel = wrapLanguageModel({
    model: rawDefaultModel,
    middleware: addToolInputExamplesMiddleware(),
  });
  const visionModel = wrapLanguageModel({
    model: rawVisionModel,
    middleware: addToolInputExamplesMiddleware(),
  });
  const strongModel = wrapLanguageModel({
    model: rawStrongModel,
    middleware: addToolInputExamplesMiddleware(),
  });

  return {
    defaultModel,
    visionModel,
    strongModel,
    rawDefaultModel,
    rawVisionModel,
    rawStrongModel,
  };
}

export function isStep12DeterministicEnabled(env: Env): boolean {
  const explicit = env.WIZARD_STEP12_DETERMINISTIC_ENABLED;
  if (explicit !== undefined) {
    return /^(1|true|yes|on)$/i.test(explicit.trim());
  }

  return env.NODE_ENV !== "production";
}

// ============================================
// Message Processing Utilities
// ============================================

/**
 * Find a pending confirmation request from the most recent assistant message.
 */
export function findPendingConfirmationRequest(
  existingMessages: SerializedUIMessage[]
): StepConfirmationRequest | undefined {
  const mostRecentAssistantMsg = [...existingMessages]
    .reverse()
    .find((m) => m.role === "assistant");

  if (!mostRecentAssistantMsg) {
    return undefined;
  }

  const assistantParts = (mostRecentAssistantMsg.parts || []) as Array<{
    type?: string;
    data?: { request?: StepConfirmationRequest };
  }>;

  const confirmationPart = assistantParts.find(
    (p) => p.type === "data-step-confirmation-request"
  );

  return confirmationPart?.data?.request;
}

/**
 * Filter messages for AI consumption.
 * Removes empty messages and messages with only data-* parts.
 */
export function filterMessagesForAI(
  messages: SerializedUIMessage[]
): SerializedUIMessage[] {
  return messages.flatMap((msg) => {
    const parts = msg.parts as Array<Record<string, unknown>> | undefined;
    if (!parts || parts.length === 0) {
      console.log("[filterMessagesForAI] Filtering out message with empty parts:", msg.role);
      return [];
    }

    // Remove storage placeholders for stripped binary content before AI conversion.
    // These placeholders are useful for persistence, but they are not valid model inputs.
    const sanitizedParts = parts.filter((part) => {
      // Legacy deterministic paths stored `dynamic-tool` parts that are not valid
      // model inputs (missing toolName/toolCallId). Drop them before conversion.
      if (part.type === "dynamic-tool") {
        return false;
      }

      if (part.type === "image") {
        const hasImageData = typeof part.image === "string" && part.image.length > 0;
        const isStrippedImagePlaceholder = part.imageStripped === true || !hasImageData;
        if (isStrippedImagePlaceholder) {
          return false;
        }
      }

      if (part.type === "file") {
        const hasFileData = typeof part.data === "string" || typeof part.url === "string";
        const isStrippedFilePlaceholder = part.fileStripped === true || !hasFileData;
        if (isStrippedFilePlaceholder) {
          return false;
        }
      }

      return true;
    });

    if (sanitizedParts.length === 0) {
      console.log(
        "[filterMessagesForAI] Filtering out message with no usable parts after sanitization:",
        msg.role
      );
      return [];
    }

    // Check if message has at least one non-data part
    const hasModelContent = sanitizedParts.some((p) => !String(p.type || "").startsWith("data-"));
    if (!hasModelContent) {
      console.log("[filterMessagesForAI] Filtering out message with only data parts:", msg.role);
      return [];
    }

    return [
      {
        ...msg,
        parts: sanitizedParts,
      },
    ];
  });
}

/**
 * Create the onFinish handler factory for saving assistant messages.
 */
export function createOnFinishHandler(
  db: ReturnType<typeof createDb>,
  sessionId: string,
  step: WizardStep,
  env?: Env,
  telemetry?: WizardTelemetryContext
) {
  return async ({ responseMessage }: { responseMessage: { id: string; parts: Array<Record<string, unknown>> } }) => {
    // Convert to serializable format
    const responseParts: Array<Record<string, unknown>> = responseMessage.parts.map((part) => {
      return { ...part };
    });

    // Only save messages that have user-visible content.
    if (responseParts.length === 0 || !hasRenderableAssistantParts(responseParts)) {
      return;
    }

    const assistantMessage: SerializedUIMessage = {
      id: responseMessage.id,
      role: "assistant",
      content: "",
      parts: stripLargeDataForStorage(responseParts),
      createdAt: new Date().toISOString(),
    };

    await saveAssistantMessage(db, sessionId, step, assistantMessage);

    if (env && telemetry?.traceId) {
      await flushLangfuse(env);
      await flushLangfuseTelemetry();
    }
  };
}

/**
 * Build consistent telemetry metadata for AI SDK calls.
 */
export function buildTelemetrySettings(
  telemetry: WizardTelemetryContext | undefined,
  functionId: string,
  metadata: Record<string, string | number | boolean | undefined> = {},
  env?: Env
) {
  if (!telemetry?.traceId) return undefined;

  const cleanedMetadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) cleanedMetadata[key] = value;
  }

  return {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    tracer: env ? getLangfuseTelemetryTracer(env) : undefined,
    functionId,
    metadata: {
      langfuseTraceId: telemetry.traceId,
      wizardSessionId: telemetry.sessionId,
      wizardStep: telemetry.step,
      environment: telemetry.environment,
      ...cleanedMetadata,
    },
  };
}

// ============================================
// Confirmation Flow Utilities
// ============================================

/**
 * Get the confirmation tool name for a given step.
 */
export function getConfirmationToolName(step: WizardStep): string {
  const toolNames: Record<WizardStep, string> = {
    "party-info": "confirmPartyInfo",
    "guests": "confirmGuestList",
    "menu": "confirmMenu",
    "timeline": "confirmTimeline",
  };
  return toolNames[step];
}

/**
 * Get step-specific revision instructions.
 */
export function getRevisionToolInstructions(step: WizardStep): string {
  const instructions: Record<WizardStep, string> = {
    "party-info": `Call confirmPartyInfo with the corrected information.`,
    "guests": `If adding guests: call addGuest for each new guest, then call confirmGuestList.
If removing guests: call removeGuest for each guest to remove, then call confirmGuestList.
If just confirming: call confirmGuestList.`,
    "menu": `If adding recipes: call addExistingRecipe, generateRecipeIdea, or extractRecipeFromUrl as needed, then call confirmMenu.
If removing items: call removeMenuItem, then call confirmMenu.
If just confirming: call confirmMenu.`,
    "timeline": `If adjusting the schedule: call adjustTimeline, then call confirmTimeline.
If just confirming: call confirmTimeline.`,
  };
  return instructions[step];
}

// ============================================
// Image Hashing Utility
// ============================================

/**
 * Hash image data using Web Crypto API for deduplication.
 */
export async function hashImageData(base64Data: string): Promise<string> {
  const data = new TextEncoder().encode(base64Data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ============================================
// Stream Response Utilities
// ============================================

/**
 * Write a text message to the stream and save to DB.
 */
export async function writeTextAndSave(
  writer: UIMessageStreamWriter<WizardMessage>,
  db: ReturnType<typeof createDb>,
  sessionId: string,
  step: WizardStep,
  text: string,
  additionalParts?: Array<Record<string, unknown>>
): Promise<void> {
  const textId = crypto.randomUUID();
  writer.write({ type: "text-start", id: textId });
  writer.write({ type: "text-delta", id: textId, delta: text });
  writer.write({ type: "text-end", id: textId });
  if (additionalParts) {
    for (const part of additionalParts) {
      writer.write(part as never);
    }
  }

  const parts: Array<Record<string, unknown>> = [
    { type: "text", text },
    ...(additionalParts || []),
  ];

  const assistantMessage: SerializedUIMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: text,
    parts,
    createdAt: new Date().toISOString(),
  };

  await saveAssistantMessage(db, sessionId, step, assistantMessage);
}
