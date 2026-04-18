/**
 * Wizard AI Runner — shared streamText/generateObject pipeline with telemetry.
 *
 * Replaces the duplicated `runAttempt` inner function across all wizard handlers.
 * Manages: stream merging, result destructuring, silent-completion detection,
 * retry with model escalation, and telemetry generation lifecycle.
 */

import type { ToolSet, UIMessageStreamWriter } from "ai";
import type { ZodSchema } from "zod";
import type { TelemetryPort } from "./telemetry-port";

// ============================================
// Types
// ============================================

export interface AttemptResult {
  responseText: string;
  finishReason: string;
  rawFinishReason: string;
  usage: unknown;
  toolCalls: unknown[];
  toolResults: unknown[];
  isSilentCompletion: boolean;
  responseMessageCount: number;
  modelTier: "default" | "strong";
}

export interface AIRunnerConfig {
  telemetry: TelemetryPort;
  functionIdPrefix: string;
}

export interface RunWithRetryParams {
  model: unknown;
  modelName: string;
  systemPrompt: string;
  messages: unknown[];
  tools: ToolSet;
  confirmationToolName: string;
  writer: UIMessageStreamWriter;
  strongModel: unknown;
  strongModelName: string;
  metadata?: Record<string, unknown>;
}

export interface RunWithRetryResult {
  result: AttemptResult;
  retryAttempted: boolean;
  retrySucceeded: boolean;
  attempts: AttemptResult[];
}

// ============================================
// Silent completion detection
// ============================================

function isSilentCompletion(params: {
  responseText: string;
  toolCalls: unknown[];
  toolResults: unknown[];
  usage: { outputTokens?: unknown } | null | undefined;
}): boolean {
  if (params.responseText.trim().length > 0) return false;
  if (params.toolCalls.length > 0 || params.toolResults.length > 0) return false;

  const outputTokens = normalizeTokenCount(params.usage?.outputTokens);
  if (outputTokens !== undefined) return outputTokens <= 0;

  return true;
}

function normalizeTokenCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
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

// ============================================
// runWithRetry
// ============================================

export async function runWithRetry(
  config: AIRunnerConfig,
  params: RunWithRetryParams
): Promise<RunWithRetryResult> {
  const { streamText, stepCountIs, hasToolCall } = await import("ai");
  const { telemetry, functionIdPrefix } = config;

  const runAttempt = async (
    attempt: number,
    model: unknown,
    modelName: string,
    modelTier: "default" | "strong",
    systemPrompt: string
  ): Promise<AttemptResult> => {
    const generationName =
      attempt === 1
        ? `${functionIdPrefix}.streamText`
        : `${functionIdPrefix}.streamText.retry`;

    const gen = telemetry.startGeneration({
      name: generationName,
      model: modelName,
      input: {
        systemPrompt,
        messageCount: params.messages.length,
        toolNames: Object.keys(params.tools),
        toolCount: Object.keys(params.tools).length,
        retryAttempt: attempt,
        modelTier,
        ...params.metadata,
      },
      metadata: {
        retryAttempt: attempt,
        modelTier,
      },
    });

    const result = streamText({
      model: model as never,
      system: systemPrompt,
      messages: params.messages as never,
      tools: params.tools,
      stopWhen: [stepCountIs(10), hasToolCall(params.confirmationToolName)],
      experimental_telemetry: telemetry.getTelemetrySettings(
        `${functionIdPrefix}.streamText`,
        {
          messageCount: params.messages.length,
          toolCount: Object.keys(params.tools).length,
          retryAttempt: attempt,
          modelTier,
          ...params.metadata,
        }
      ),
    });

    params.writer.merge(result.toUIMessageStream());

    const [response, responseText, finishReason, rawFinishReason, usage, toolCalls, toolResults] =
      await Promise.all([
        result.response,
        result.text,
        result.finishReason,
        result.rawFinishReason,
        result.usage,
        result.toolCalls,
        result.toolResults,
      ]);

    const silent = isSilentCompletion({
      responseText,
      toolCalls: toolCalls as unknown[],
      toolResults: toolResults as unknown[],
      usage: usage as { outputTokens?: unknown } | null,
    });

    gen.update({
      output: {
        finishReason,
        rawFinishReason,
        text: responseText,
        responseMessages: response.messages,
        toolCallCount: (toolCalls as unknown[]).length,
        toolResultCount: (toolResults as unknown[]).length,
        isSilentCompletion: silent,
        modelTier,
      },
      usage,
    });
    gen.end();

    return {
      responseText,
      finishReason,
      rawFinishReason,
      usage,
      toolCalls: toolCalls as unknown[],
      toolResults: toolResults as unknown[],
      isSilentCompletion: silent,
      responseMessageCount: response.messages.length,
      modelTier,
    };
  };

  const firstAttempt = await runAttempt(
    1,
    params.model,
    params.modelName,
    "default",
    params.systemPrompt
  );

  if (!firstAttempt.isSilentCompletion) {
    return {
      result: firstAttempt,
      retryAttempted: false,
      retrySucceeded: false,
      attempts: [firstAttempt],
    };
  }

  // Retry with strong model
  const retrySystemPrompt = `${params.systemPrompt}

<retry-instruction>
Your previous attempt returned no visible response. Provide a concise user-visible reply, and call tools if needed.
</retry-instruction>`;

  const retryAttempt = await runAttempt(
    2,
    params.strongModel,
    params.strongModelName,
    "strong",
    retrySystemPrompt
  );

  return {
    result: retryAttempt,
    retryAttempted: true,
    retrySucceeded: !retryAttempt.isSilentCompletion,
    attempts: [firstAttempt, retryAttempt],
  };
}

// ============================================
// tracedGenerateObject
// ============================================

export interface TracedGenerateObjectParams<T> {
  generationName: string;
  modelName: string;
  model: unknown;
  schema: ZodSchema<T>;
  prompt?: string;
  messages?: unknown[];
  metadata?: Record<string, unknown>;
}

export async function tracedGenerateObject<T>(
  config: AIRunnerConfig,
  params: TracedGenerateObjectParams<T>
): Promise<{ object: T; usage?: unknown }> {
  const { generateObject } = await import("ai");
  const { telemetry, functionIdPrefix } = config;

  const gen = telemetry.startGeneration({
    name: params.generationName,
    model: params.modelName,
    input: {
      prompt: params.prompt,
      messageCount: params.messages?.length,
      ...params.metadata,
    },
    metadata: params.metadata,
  });

  try {
    const result = await generateObject({
      model: params.model as never,
      schema: params.schema as never,
      prompt: params.prompt,
      messages: params.messages as never,
      experimental_telemetry: telemetry.getTelemetrySettings(
        `${functionIdPrefix}.generateObject`,
        params.metadata
      ),
    });

    gen.update({
      output: result.object,
      usage: result.usage,
    });
    gen.end();

    return { object: result.object as T, usage: result.usage };
  } catch (error) {
    gen.end();
    throw error;
  }
}
