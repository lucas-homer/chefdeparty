import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import {
  parties,
  guests,
  recipes,
  partyMenu,
  timelineTasks,
  scheduledReminders,
  calendarConnections,
  wizardSessions,
  wizardMessages,
  type SerializedUIMessage,
} from "../../../drizzle/schema";
import { requireAuth, getUser } from "../../lib/hono-auth";
import {
  wizardCompleteRequestSchema,
  wizardStepSchema,
  type WizardStep,
  type MenuPlanData,
} from "../../lib/wizard-schemas";
import { aiRecipeExtractionSchema } from "../../lib/schemas";
import { getWizardTools } from "../../lib/party-wizard-tools";
import { getStepSystemPrompt } from "../../lib/party-wizard-prompts";
import {
  deserializeWizardSession,
  serializePartyInfo,
  serializeGuestList,
  serializeMenuPlan,
  serializeTimeline,
  type DeserializedWizardSession,
} from "../../lib/wizard-session-serialization";
import type { WizardMessage } from "../../lib/wizard-message-types";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

// Schema for step confirmation decision (HITL pattern from cohort-002-project)
const confirmationDecisionSchema = z.object({
  requestId: z.string(),
  decision: z.union([
    z.object({ type: z.literal("approve") }),
    z.object({ type: z.literal("revise"), feedback: z.string() }),
  ]),
});

// Schema for session chat request (AI SDK v6 canonical pattern)
// Client sends only the latest message, server reconstructs history from DB
// confirmationDecision is passed as separate body param (cohort-002-project pattern)
const sessionChatRequestSchema = z.object({
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

// Schema for step change request
const stepChangeSchema = z.object({
  step: wizardStepSchema,
});

// Strip large binary data (images) from message parts before storing in DB
// D1/SQLite has a ~1MB limit for TEXT columns, and base64 images exceed this
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripLargeDataForStorage(parts: any[]): any[] {
  return parts.map((part) => {
    // Replace image data with a placeholder
    if (part.type === "image" && part.image) {
      return {
        type: "image",
        imageStripped: true, // Marker that image was stripped
        mimeType: typeof part.image === "string" && part.image.startsWith("data:")
          ? part.image.split(";")[0].replace("data:", "")
          : "image/unknown",
      };
    }
    // Handle file parts similarly
    if (part.type === "file" && part.data) {
      return {
        type: "file",
        fileStripped: true,
        mimeType: part.mimeType || "application/octet-stream",
        name: part.name,
      };
    }
    return part;
  });
}

const partyWizardRoutes = new Hono<AppContext>()
  .use("*", requireAuth)

  // GET /api/parties/wizard/session - Load or create active session
  .get("/session", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");

    // Find active session for user
    const [existingSession] = await db
      .select()
      .from(wizardSessions)
      .where(
        and(
          eq(wizardSessions.userId, user.id),
          eq(wizardSessions.status, "active")
        )
      )
      .limit(1);

    if (existingSession) {
      // Load messages for current step
      const stepMessages = await db
        .select()
        .from(wizardMessages)
        .where(
          and(
            eq(wizardMessages.sessionId, existingSession.id),
            eq(wizardMessages.step, existingSession.currentStep)
          )
        )
        .orderBy(wizardMessages.createdAt);

      // Deserialize session for client (converts string dates to Date objects)
      return c.json({
        session: deserializeWizardSession(existingSession),
        messages: stepMessages.map((m) => m.message),
      });
    }

    // Create new session
    const [newSession] = await db
      .insert(wizardSessions)
      .values({
        userId: user.id,
        currentStep: "party-info",
        guestList: [],
        status: "active",
      })
      .returning();

    return c.json({
      session: deserializeWizardSession(newSession),
      messages: [],
    });
  })

  // GET /api/parties/wizard/session/:id - Get session state only (no messages)
  .get("/session/:id", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const sessionId = c.req.param("id");

    const [session] = await db
      .select()
      .from(wizardSessions)
      .where(
        and(
          eq(wizardSessions.id, sessionId),
          eq(wizardSessions.userId, user.id)
        )
      )
      .limit(1);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json({ session: deserializeWizardSession(session) });
  })

  // POST /api/parties/wizard/session/new - Start fresh session (abandons existing)
  .post("/session/new", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");

    // Mark existing active sessions as abandoned
    await db
      .update(wizardSessions)
      .set({ status: "abandoned", updatedAt: new Date() })
      .where(
        and(
          eq(wizardSessions.userId, user.id),
          eq(wizardSessions.status, "active")
        )
      );

    // Create new session
    const [newSession] = await db
      .insert(wizardSessions)
      .values({
        userId: user.id,
        currentStep: "party-info",
        guestList: [],
        status: "active",
      })
      .returning();

    return c.json({
      session: deserializeWizardSession(newSession),
      messages: [],
    });
  })

  // PUT /api/parties/wizard/session/:id/step - Change step
  .put("/session/:id/step", zValidator("json", stepChangeSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const sessionId = c.req.param("id");
    const { step } = c.req.valid("json");

    // Update session step
    const [updatedSession] = await db
      .update(wizardSessions)
      .set({ currentStep: step, updatedAt: new Date() })
      .where(
        and(
          eq(wizardSessions.id, sessionId),
          eq(wizardSessions.userId, user.id)
        )
      )
      .returning();

    if (!updatedSession) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Load messages for new step
    const stepMessages = await db
      .select()
      .from(wizardMessages)
      .where(
        and(
          eq(wizardMessages.sessionId, sessionId),
          eq(wizardMessages.step, step)
        )
      )
      .orderBy(wizardMessages.createdAt);

    return c.json({
      session: deserializeWizardSession(updatedSession),
      messages: stepMessages.map((m) => m.message),
    });
  })

  // POST /api/parties/wizard/chat - Streaming chat for wizard (session-based)
  // Follows AI SDK v6 canonical pattern with HITL for step confirmations:
  // - Client sends single message (latest user message)
  // - Server reconstructs history from DB
  // - Confirmation tools emit data parts, stop execution for user approval
  // - User approval decisions trigger step transitions
  .post("/chat", async (c) => {
    console.log("[wizard/chat] Request received");
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const body = await c.req.json();
    console.log("[wizard/chat] Body:", JSON.stringify(body, null, 2));

    // Validate request - expects single message, not array
    const parseResult = sessionChatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      console.log("[wizard/chat] Validation failed:", parseResult.error.errors);
      return c.json({ error: "Invalid request", details: parseResult.error.errors }, 400);
    }

    const { sessionId, message: incomingMessage, confirmationDecision: bodyDecision } = parseResult.data;

    // Validate it's a user message
    if (incomingMessage.role !== "user") {
      return c.json({ error: "Message must be from user" }, 400);
    }

    console.log("[wizard/chat] Confirmation decision from body:", bodyDecision);

    // Load session
    const [session] = await db
      .select()
      .from(wizardSessions)
      .where(
        and(
          eq(wizardSessions.id, sessionId),
          eq(wizardSessions.userId, user.id)
        )
      )
      .limit(1);

    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    let step = session.currentStep as WizardStep;

    // Load existing messages for this step from DB
    const existingMessages = await db
      .select()
      .from(wizardMessages)
      .where(
        and(
          eq(wizardMessages.sessionId, sessionId),
          eq(wizardMessages.step, step)
        )
      )
      .orderBy(wizardMessages.createdAt);

    // Deserialize session to get properly typed data
    const deserializedSession = deserializeWizardSession(session);
    let currentData = {
      partyInfo: deserializedSession.partyInfo,
      guestList: deserializedSession.guestList,
      menuPlan: deserializedSession.menuPlan,
      timeline: deserializedSession.timeline,
    };

    // Create user message from the incoming AI SDK message
    // In AI SDK v6, text is in parts array, not content string
    const userMessageId = incomingMessage.id || crypto.randomUUID();
    let parts = incomingMessage.parts || [];
    const textContent = parts
      .filter((p: { type: string }) => p.type === "text")
      .map((p: { type: string; text?: string }) => p.text || "")
      .join("");

    // Add confirmation decision as data part if provided (cohort-002-project pattern)
    // This ensures the decision is persisted with the message
    if (bodyDecision) {
      parts = [
        ...parts,
        {
          type: "data-step-confirmation-decision",
          data: bodyDecision,
        },
      ];
    }

    // Keep original parts (with image data) for AI processing
    const partsForAI = parts.length > 0 ? parts : [{ type: "text", text: textContent }];

    // Strip large data (images) for database storage
    const partsForStorage = stripLargeDataForStorage(partsForAI);

    const userMessageForStorage: SerializedUIMessage = {
      id: userMessageId,
      role: "user",
      content: textContent,
      parts: partsForStorage,
      createdAt: incomingMessage.createdAt || new Date().toISOString(),
    };

    // Save user message to DB (with stripped image data)
    await db.insert(wizardMessages).values({
      sessionId,
      step,
      message: userMessageForStorage,
    });

    // Full message (with image data) for AI processing in this request
    const userMessageForAI: SerializedUIMessage = {
      id: userMessageId,
      role: "user",
      content: textContent,
      parts: partsForAI,
      createdAt: incomingMessage.createdAt || new Date().toISOString(),
    };

    // Reconstruct full message history: existing + new user message (with full image data)
    const allMessages = [
      ...existingMessages.map((m) => m.message),
      userMessageForAI,
    ];

    console.log("[wizard/chat] Step:", step, "Messages count:", allMessages.length);
    console.log("[wizard/chat] Existing messages from DB:", JSON.stringify(existingMessages.map(m => ({
      role: m.message.role,
      parts: m.message.parts,
      content: m.message.content,
    })), null, 2));

    // Dynamically import AI dependencies
    const {
      streamText,
      convertToModelMessages,
      stepCountIs,
      hasToolCall,
      createUIMessageStream,
      createUIMessageStreamResponse,
      wrapLanguageModel,
      addToolInputExamplesMiddleware,
    } = await import("ai");
    const { createAI } = await import("../../lib/ai");
    const { defaultModel: rawDefaultModel, visionModel: rawVisionModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

    // Wrap models with middleware to add inputExamples to tool descriptions
    // This is needed because Gemini doesn't natively support inputExamples
    const defaultModel = wrapLanguageModel({
      model: rawDefaultModel,
      middleware: addToolInputExamplesMiddleware(),
    });
    const visionModel = wrapLanguageModel({
      model: rawVisionModel,
      middleware: addToolInputExamplesMiddleware(),
    });

    // Use confirmation decision from body (cohort-002-project pattern)
    // The decision was already added as a data part to the message above

    // Find the most recent confirmation request from assistant messages
    const mostRecentAssistantMsg = [...existingMessages].reverse().find(m => m.message.role === "assistant");
    const assistantParts = (mostRecentAssistantMsg?.message.parts || []) as Array<{ type?: string; data?: unknown }>;
    const pendingConfirmationRequest = assistantParts.find(
      (p) => p.type === "data-step-confirmation-request"
    ) as { type: string; data: { request: { id: string; step: string; nextStep: string; summary: string } } } | undefined;

    // Check if this is a revision request
    const isRevisionRequest = bodyDecision?.decision.type === "revise";
    const revisionFeedback = isRevisionRequest && bodyDecision?.decision.type === "revise"
      ? bodyDecision.decision.feedback
      : undefined;

    // Get user's recipes for menu step
    let userRecipes: Array<{ id: string; name: string; description: string | null }> = [];
    if (step === "menu") {
      userRecipes = await db
        .select({
          id: recipes.id,
          name: recipes.name,
          description: recipes.description,
        })
        .from(recipes)
        .where(eq(recipes.ownerId, user.id));
    }

    // Build system prompt with context
    const systemPrompt = getStepSystemPrompt(step, {
      partyInfo: currentData.partyInfo ?? undefined,
      guestList: currentData.guestList,
      menuPlan: currentData.menuPlan ?? undefined,
      userRecipes,
    });

    // Check if the message contains an image
    const hasImage = incomingMessage.parts?.some((p: { type: string }) => p.type === "image");

    // Get the confirmation tool name for the current step
    const confirmationToolName = {
      "party-info": "confirmPartyInfo",
      "guests": "confirmGuestList",
      "menu": "confirmMenu",
      "timeline": "confirmTimeline",
    }[step];

    try {
      // Create the UI message stream using canonical pattern with HITL
      const stream = createUIMessageStream<WizardMessage>({
        execute: async ({ writer }) => {
          // If user approved a confirmation, process it (cohort-002-project pattern)
          if (bodyDecision && pendingConfirmationRequest) {
            const decision = bodyDecision.decision;
            const request = pendingConfirmationRequest.data.request;

            if (decision.type === "approve") {
              // Update step in DB
              const nextStep = request.nextStep as WizardStep | "complete";

              // Calculate the index of the next step for furthestStepIndex tracking
              const stepIndices: Record<WizardStep | "complete", number> = {
                "party-info": 0,
                "guests": 1,
                "menu": 2,
                "timeline": 3,
                "complete": 3, // timeline is the last step
              };
              const nextStepIndex = stepIndices[nextStep];

              // Fetch current furthestStepIndex to only increase it (never decrease)
              const currentSession = await db.query.wizardSessions.findFirst({
                where: eq(wizardSessions.id, sessionId),
                columns: { furthestStepIndex: true },
              });
              const currentFurthestIndex = currentSession?.furthestStepIndex ?? 0;
              const newFurthestIndex = Math.max(currentFurthestIndex, nextStepIndex);

              if (nextStep !== "complete") {
                await db
                  .update(wizardSessions)
                  .set({
                    currentStep: nextStep,
                    furthestStepIndex: newFurthestIndex,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(wizardSessions.id, sessionId),
                      eq(wizardSessions.userId, user.id)
                    )
                  );
                step = nextStep;
              } else {
                // For "complete", still update furthestStepIndex
                await db
                  .update(wizardSessions)
                  .set({
                    furthestStepIndex: newFurthestIndex,
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(wizardSessions.id, sessionId),
                      eq(wizardSessions.userId, user.id)
                    )
                  );
              }

              // Emit step-confirmed data part
              writer.write({
                type: "data-step-confirmed",
                data: {
                  requestId: request.id,
                  step: request.step as WizardStep,
                  nextStep: nextStep,
                },
              });

              // For all approvals, just return the confirmation
              // Client will handle step transition based on data-step-confirmed
              // The AI will be called fresh when user sends first message in new step
              return;
            }
            // If rejected, the feedback is in the text content - continue to AI to process it
          }

          // ========================================
          // WORKFLOW: Direct image-to-recipe extraction
          // When user uploads an image on the menu step, skip LLM tool decision
          // and directly extract the recipe using vision model
          // ========================================
          if (step === "menu" && hasImage) {
            console.log("[wizard/chat] Image detected on menu step - using direct extraction workflow");

            // Find the image part(s) from the user message
            const imageParts = partsForAI.filter(
              (p: { type: string }) => p.type === "image"
            ) as Array<{ type: "image"; image: string }>;

            if (imageParts.length > 0) {
              // Helper to hash image data using Web Crypto API
              async function hashImageData(base64Data: string): Promise<string> {
                const data = new TextEncoder().encode(base64Data);
                const hashBuffer = await crypto.subtle.digest("SHA-256", data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
              }

              // Compute hash of the first image
              const imageData = imageParts[0].image;
              const imageHash = await hashImageData(imageData);

              // Check if image has already been processed
              const processedHashes = currentData.menuPlan?.processedImageHashes || [];
              if (processedHashes.includes(imageHash)) {
                console.log("[wizard/chat] Image already processed, skipping");

                // Emit a message telling the user this image was already added
                const responseText = "This image has already been added to the menu.";
                writer.write({
                  type: "text-delta",
                  textDelta: responseText,
                });

                // Save assistant response to DB
                const assistantMessage: SerializedUIMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: responseText,
                  parts: [{ type: "text", text: responseText }],
                  createdAt: new Date().toISOString(),
                };

                await db.insert(wizardMessages).values({
                  sessionId,
                  step,
                  message: assistantMessage,
                });

                return; // Skip extraction - already processed
              }

              const { generateObject } = await import("ai");

              try {
                // Use vision model to extract recipe from image
                const { object: recipe } = await generateObject({
                  model: rawVisionModel, // Use raw model (no middleware needed for generateObject)
                  schema: aiRecipeExtractionSchema,
                  messages: [
                    {
                      role: "user",
                      content: [
                        ...imageParts.map((img) => ({
                          type: "image" as const,
                          image: img.image,
                        })),
                        {
                          type: "text" as const,
                          text: `Extract the recipe from this image. Parse all ingredients with their amounts, units, and names. Include step-by-step instructions.

If the image shows a handwritten or printed recipe card, transcribe it accurately.
If it shows a dish/food, infer a reasonable recipe for it.
If the recipe name isn't clear, give it an appropriate name based on the dish.`,
                        },
                      ],
                    },
                  ],
                });

                console.log("[wizard/chat] Recipe extracted from image:", recipe.name);

                // Add to menu plan (same logic as generateRecipeIdea tool)
                const menuPlan: MenuPlanData = currentData.menuPlan
                  ? {
                      ...currentData.menuPlan,
                      existingRecipes: [...(currentData.menuPlan.existingRecipes || [])],
                      newRecipes: [...(currentData.menuPlan.newRecipes || [])],
                    }
                  : { existingRecipes: [], newRecipes: [] };

                menuPlan.newRecipes = [
                  ...menuPlan.newRecipes,
                  {
                    ...recipe,
                    sourceType: "photo" as const,
                    imageHash, // Store hash with recipe for removal tracking
                  },
                ];

                // Track this image hash as processed to prevent duplicates
                menuPlan.processedImageHashes = [...(menuPlan.processedImageHashes || []), imageHash];

                // Update currentData
                currentData.menuPlan = menuPlan;

                // Persist to session
                await db
                  .update(wizardSessions)
                  .set({
                    menuPlan: serializeMenuPlan(menuPlan),
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(wizardSessions.id, sessionId),
                      eq(wizardSessions.userId, user.id)
                    )
                  );

                // Build response message
                const responseText = `I extracted "${recipe.name}" from your image and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.

What else would you like to add, or are you ready to finalize the menu?`;

                // Emit recipe-extracted data part with full recipe for client rendering
                writer.write({
                  type: "data-recipe-extracted",
                  data: {
                    recipe: {
                      ...recipe,
                      sourceType: "photo" as const,
                    },
                    message: responseText,
                  },
                });

                // Save assistant response to DB with the recipe data part
                const assistantMessage: SerializedUIMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: responseText,
                  parts: [
                    {
                      type: "data-recipe-extracted",
                      data: {
                        recipe: {
                          name: recipe.name,
                          description: recipe.description,
                          ingredients: recipe.ingredients,
                          instructions: recipe.instructions,
                          prepTimeMinutes: recipe.prepTimeMinutes,
                          cookTimeMinutes: recipe.cookTimeMinutes,
                          servings: recipe.servings,
                          tags: recipe.tags,
                          sourceType: "photo",
                        },
                        message: responseText,
                      },
                    },
                  ],
                  createdAt: new Date().toISOString(),
                };

                await db.insert(wizardMessages).values({
                  sessionId,
                  step,
                  message: assistantMessage,
                });

                return; // Skip streamText - we handled this deterministically
              } catch (error) {
                console.error("[wizard/chat] Image extraction failed:", error);
                // Fall through to normal LLM flow, which will explain it can't process the image
                // (This gracefully handles cases where the image isn't a recipe)
              }
            }
          }

          // ========================================
          // WORKFLOW: Direct URL-to-recipe extraction
          // When user pastes a URL on the menu step, skip LLM tool decision
          // and directly extract the recipe
          // ========================================
          if (step === "menu" && !hasImage) {
            // Check for URLs in the text content
            const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
            const urls = textContent.match(urlRegex);

            if (urls && urls.length > 0) {
              const url = urls[0]; // Use the first URL found
              console.log("[wizard/chat] URL detected on menu step - using direct extraction workflow:", url);

              // Check if URL has already been processed
              const processedUrls = currentData.menuPlan?.processedUrls || [];
              if (processedUrls.includes(url)) {
                console.log("[wizard/chat] URL already processed, skipping:", url);

                // Emit a message telling the user this URL was already added
                const responseText = "This recipe URL has already been added to the menu.";
                writer.write({
                  type: "text-delta",
                  textDelta: responseText,
                });

                // Save assistant response to DB
                const assistantMessage: SerializedUIMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: responseText,
                  parts: [{ type: "text", text: responseText }],
                  createdAt: new Date().toISOString(),
                };

                await db.insert(wizardMessages).values({
                  sessionId,
                  step,
                  message: assistantMessage,
                });

                return; // Skip extraction - already processed
              }

              try {
                const { generateObject } = await import("ai");

                // Fetch via Tavily (same as the tool)
                const tavilyRes = await fetch("https://api.tavily.com/extract", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${c.env.TAVILY_API_KEY}`,
                  },
                  body: JSON.stringify({ urls: [url] }),
                });

                if (!tavilyRes.ok) {
                  throw new Error("Failed to fetch URL content");
                }

                const tavilyData = (await tavilyRes.json()) as {
                  results: Array<{ raw_content?: string; content?: string }>;
                };
                const content =
                  tavilyData.results[0]?.raw_content || tavilyData.results[0]?.content;

                if (!content) {
                  throw new Error("Could not extract content from URL");
                }

                // Extract with AI
                const { object: recipe } = await generateObject({
                  model: rawDefaultModel,
                  schema: aiRecipeExtractionSchema,
                  prompt: `Extract the recipe from this webpage. Parse ingredients with amount/unit/name separated.\n\n${content}`,
                });

                console.log("[wizard/chat] Recipe extracted from URL:", recipe.name);

                // Add to menu plan
                const menuPlan: MenuPlanData = currentData.menuPlan
                  ? {
                      ...currentData.menuPlan,
                      existingRecipes: [...(currentData.menuPlan.existingRecipes || [])],
                      newRecipes: [...(currentData.menuPlan.newRecipes || [])],
                    }
                  : { existingRecipes: [], newRecipes: [] };

                menuPlan.newRecipes = [
                  ...menuPlan.newRecipes,
                  {
                    ...recipe,
                    sourceUrl: url,
                    sourceType: "url" as const,
                  },
                ];

                // Track this URL as processed
                menuPlan.processedUrls = [...(menuPlan.processedUrls || []), url];

                // Update currentData
                currentData.menuPlan = menuPlan;

                // Persist to session
                await db
                  .update(wizardSessions)
                  .set({
                    menuPlan: serializeMenuPlan(menuPlan),
                    updatedAt: new Date(),
                  })
                  .where(
                    and(
                      eq(wizardSessions.id, sessionId),
                      eq(wizardSessions.userId, user.id)
                    )
                  );

                // Build response message
                const responseText = `I imported "${recipe.name}" from that URL and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.

What else would you like to add, or are you ready to finalize the menu?`;

                // Emit recipe-extracted data part
                writer.write({
                  type: "data-recipe-extracted",
                  data: {
                    recipe: {
                      ...recipe,
                      sourceType: "url" as const,
                    },
                    message: responseText,
                  },
                });

                // Save assistant response to DB
                const assistantMessage: SerializedUIMessage = {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: responseText,
                  parts: [
                    {
                      type: "data-recipe-extracted",
                      data: {
                        recipe: {
                          name: recipe.name,
                          description: recipe.description,
                          ingredients: recipe.ingredients,
                          instructions: recipe.instructions,
                          prepTimeMinutes: recipe.prepTimeMinutes,
                          cookTimeMinutes: recipe.cookTimeMinutes,
                          servings: recipe.servings,
                          tags: recipe.tags,
                          sourceType: "url",
                        },
                        message: responseText,
                      },
                    },
                  ],
                  createdAt: new Date().toISOString(),
                };

                await db.insert(wizardMessages).values({
                  sessionId,
                  step,
                  message: assistantMessage,
                });

                return; // Skip streamText - we handled this deterministically
              } catch (error) {
                console.error("[wizard/chat] URL extraction failed:", error);
                // Fall through to normal LLM flow
              }
            }
          }

          // Get tools with writer for HITL data parts
          const tools = getWizardTools(step, {
            db,
            userId: user.id,
            env: c.env,
            currentData,
            sessionId,
            writer, // Pass writer so tools can emit data parts
          });

          console.log("[wizard/chat] Calling streamText with", Object.keys(tools).length, "tools");
          console.log("[wizard/chat] Tools:", Object.keys(tools));

          // Build system prompt for current step (may have changed after approval)
          let currentSystemPrompt = getStepSystemPrompt(step, {
            partyInfo: currentData.partyInfo ?? undefined,
            guestList: currentData.guestList,
            menuPlan: currentData.menuPlan ?? undefined,
            userRecipes,
          });

          // If this is a revision request, add context to the system prompt
          // This ensures the AI understands it needs to incorporate the feedback and call the confirmation tool again
          if (isRevisionRequest && revisionFeedback && pendingConfirmationRequest) {
            // Step-specific instructions for what tools to call
            const stepToolInstructions = {
              "party-info": `Call confirmPartyInfo with the corrected information.`,
              "guests": `If adding guests: call addGuest for each new guest, then call confirmGuestList.
If removing guests: call removeGuest for each guest to remove, then call confirmGuestList.
If just confirming: call confirmGuestList.`,
              "menu": `If adding recipes: call addExistingRecipe, generateRecipeIdea, or extractRecipeFromUrl as needed, then call confirmMenu.
If removing items: call removeMenuItem, then call confirmMenu.
If just confirming: call confirmMenu.`,
              "timeline": `If adjusting the schedule: call adjustTimeline, then call confirmTimeline.
If just confirming: call confirmTimeline.`,
            }[step] || `Call ${confirmationToolName}.`;

            const revisionContext = `

IMPORTANT - REVISION IN PROGRESS:
The user clicked "Make Changes" on the confirmation dialog with this feedback:
"${revisionFeedback}"

YOU MUST CALL TOOLS - do not just respond with text!
${stepToolInstructions}

Previous confirmation summary: "${pendingConfirmationRequest.data.request.summary}"`;

            currentSystemPrompt += revisionContext;
          }

          // Convert messages to model format
          // For step transitions after approval, start fresh
          // For revisions, include the message history so AI has context
          let messagesToConvert = bodyDecision?.decision.type === "approve" && pendingConfirmationRequest
            ? [] // Start fresh for new step
            : allMessages;

          // Filter out messages that would cause Gemini API errors:
          // 1. Messages with empty parts arrays
          // 2. Messages with only data-* parts (these are UI-only, not for the model)
          messagesToConvert = messagesToConvert.filter((msg) => {
            const parts = msg.parts as Array<{ type?: string }> | undefined;
            if (!parts || parts.length === 0) {
              console.log("[wizard/chat] Filtering out message with empty parts:", msg.role);
              return false;
            }
            // Check if message has at least one non-data part
            const hasModelContent = parts.some((p) => !p.type?.startsWith("data-"));
            if (!hasModelContent) {
              console.log("[wizard/chat] Filtering out message with only data parts:", msg.role);
              return false;
            }
            return true;
          });

          const modelMessages = await convertToModelMessages(messagesToConvert as WizardMessage[]);

          console.log("[wizard/chat] Model messages count:", modelMessages.length);

          const result = streamText({
            model: step === "menu" && hasImage ? visionModel : defaultModel,
            system: currentSystemPrompt,
            messages: modelMessages,
            tools,
            // For revision requests, only force tool choice on party-info step
            // because confirmPartyInfo accepts all data as parameters.
            // Other steps (guests, menu, timeline) need multiple tool calls
            // (e.g., removeGuest -> addGuest -> confirmGuestList)
            toolChoice: isRevisionRequest && confirmationToolName && step === "party-info"
              ? { type: "tool", toolName: confirmationToolName }
              : undefined,
            // Stop when confirmation tool is called (wait for user approval)
            stopWhen: confirmationToolName
              ? [stepCountIs(10), hasToolCall(confirmationToolName)]
              : stepCountIs(10),
          });

          // Merge the text stream into the UI message stream
          writer.merge(result.toUIMessageStream());

          // Wait for completion
          await result.response;
        },
        generateId: () => crypto.randomUUID(),
        onFinish: async ({ responseMessage }) => {
          console.log("[wizard/chat] onFinish called");
          console.log("[wizard/chat] Response parts count:", responseMessage.parts.length);
          console.log("[wizard/chat] Response part types:", responseMessage.parts.map(p => p.type));

          // Convert to serializable format
          const responseParts: Array<Record<string, unknown>> = responseMessage.parts.map((part) => {
            // Spread the part to convert to plain object
            return { ...part };
          });

          // Only save if the message has meaningful content
          // Skip saving empty messages (which can happen on errors)
          if (responseParts.length === 0) {
            console.log("[wizard/chat] Skipping save - empty response parts");
            return;
          }

          // Save assistant response message to DB (strip any large data)
          const assistantMessage: SerializedUIMessage = {
            id: responseMessage.id,
            role: "assistant",
            content: "", // Content is in parts in v6
            parts: stripLargeDataForStorage(responseParts),
            createdAt: new Date().toISOString(),
          };

          await db.insert(wizardMessages).values({
            sessionId,
            step,
            message: assistantMessage,
          });
        },
      });

      console.log("[wizard/chat] Stream created, returning response");
      return createUIMessageStreamResponse({ stream });
    } catch (error) {
      console.error("[wizard/chat] Error in streamText:", error);
      throw error;
    }
  })

  // POST /api/parties/wizard/complete - Create party with all entities
  .post("/complete", zValidator("json", wizardCompleteRequestSchema.extend({ sessionId: z.string().uuid().optional() })), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const { partyInfo, guestList, menuPlan, timeline, sessionId } = c.req.valid("json");

    try {
      // 1. Create the party
      const shareToken = crypto.randomUUID().slice(0, 8);
      const [newParty] = await db
        .insert(parties)
        .values({
          hostId: user.id,
          name: partyInfo.name,
          description: partyInfo.description || null,
          dateTime: partyInfo.dateTime,
          location: partyInfo.location || null,
          shareToken,
        })
        .returning();

      // 2. Create guests
      const createdGuests = [];
      for (const guest of guestList) {
        const [newGuest] = await db
          .insert(guests)
          .values({
            partyId: newParty.id,
            name: guest.name || null,
            email: guest.email || null,
            phone: guest.phone || null,
            rsvpStatus: "pending",
          })
          .returning();
        createdGuests.push(newGuest);
      }

      // 3. Create new recipes and add to menu
      const createdRecipes = [];
      for (const newRecipe of menuPlan.newRecipes) {
        const recipeShareToken = crypto.randomUUID().slice(0, 8);
        const [recipe] = await db
          .insert(recipes)
          .values({
            ownerId: user.id,
            shareToken: recipeShareToken,
            name: newRecipe.name,
            description: newRecipe.description || null,
            sourceUrl: newRecipe.sourceUrl || null,
            sourceType: newRecipe.sourceType || "ai",
            ingredients: newRecipe.ingredients,
            instructions: newRecipe.instructions,
            prepTimeMinutes: newRecipe.prepTimeMinutes || null,
            cookTimeMinutes: newRecipe.cookTimeMinutes || null,
            servings: newRecipe.servings || null,
            tags: newRecipe.tags || [],
            dietaryTags: newRecipe.dietaryTags || [],
          })
          .returning();
        createdRecipes.push(recipe);

        // Add to party menu
        await db.insert(partyMenu).values({
          partyId: newParty.id,
          recipeId: recipe.id,
          course: newRecipe.course || null,
        });
      }

      // 4. Add existing recipes to menu
      for (const menuItem of menuPlan.existingRecipes) {
        await db.insert(partyMenu).values({
          partyId: newParty.id,
          recipeId: menuItem.recipeId,
          scaledServings: menuItem.scaledServings || null,
          course: menuItem.course || null,
        });
      }

      // 5. Create timeline tasks
      const createdTasks = [];
      for (const task of timeline) {
        // Convert daysBeforeParty to actual date
        const taskDate = new Date(partyInfo.dateTime);
        taskDate.setDate(taskDate.getDate() - task.daysBeforeParty);
        taskDate.setHours(0, 0, 0, 0);

        const [newTask] = await db
          .insert(timelineTasks)
          .values({
            partyId: newParty.id,
            recipeId: task.recipeId || null,
            description: task.description,
            scheduledDate: taskDate,
            scheduledTime: task.scheduledTime,
            durationMinutes: task.durationMinutes,
            isPhaseStart: task.isPhaseStart || false,
            phaseDescription: task.phaseDescription || null,
          })
          .returning();
        createdTasks.push(newTask);
      }

      // 6. Schedule reminders for phase-start tasks (if no calendar sync)
      const REMINDER_MINUTES_BEFORE = 60;
      const [calendarConn] = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, user.id));

      const hasCalendarSync = !!calendarConn;

      if (!hasCalendarSync && createdTasks.length > 0) {
        const now = new Date();
        const phaseStartTasks = createdTasks.filter((task) => task.isPhaseStart);

        for (const task of phaseStartTasks) {
          const taskStartTime = new Date(task.scheduledDate);
          if (task.scheduledTime) {
            const [hours, minutes] = task.scheduledTime.split(":").map(Number);
            taskStartTime.setHours(hours, minutes, 0, 0);
          } else {
            taskStartTime.setHours(9, 0, 0, 0);
          }

          const reminderTime = new Date(
            taskStartTime.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000
          );

          if (reminderTime > now) {
            await db.insert(scheduledReminders).values({
              partyId: newParty.id,
              userId: user.id,
              taskId: task.id,
              scheduledFor: reminderTime,
              taskStartTime,
            });
          }
        }
      }

      // Mark session as completed if provided
      if (sessionId) {
        await db
          .update(wizardSessions)
          .set({
            status: "completed",
            partyId: newParty.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(wizardSessions.id, sessionId),
              eq(wizardSessions.userId, user.id)
            )
          );
      }

      return c.json({
        success: true,
        partyId: newParty.id,
        partyUrl: `/parties/${newParty.id}`,
        summary: {
          guestsCreated: createdGuests.length,
          recipesCreated: createdRecipes.length,
          menuItemsAdded: menuPlan.existingRecipes.length + createdRecipes.length,
          tasksCreated: createdTasks.length,
        },
      });
    } catch (error) {
      console.error("Error creating party from wizard:", error);
      return c.json({ error: "Failed to create party" }, 500);
    }
  })

  // POST /api/parties/wizard/extract-url - Extract recipe from URL (for wizard)
  .post("/extract-url", zValidator("json", z.object({ url: z.string().url() })), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const { url } = c.req.valid("json");

    // Dynamically import AI dependencies
    const { generateObject } = await import("ai");
    const { createAI } = await import("../../lib/ai");
    const { defaultModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

    // Fetch via Tavily
    const tavilyRes = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ urls: [url] }),
    });

    if (!tavilyRes.ok) {
      return c.json({ error: "Failed to fetch URL content" }, 400);
    }

    const tavilyData = (await tavilyRes.json()) as {
      results: Array<{ raw_content?: string; content?: string }>;
    };
    const content = tavilyData.results[0]?.raw_content || tavilyData.results[0]?.content;

    if (!content) {
      return c.json({ error: "Could not extract content from URL" }, 400);
    }

    // Extract with AI
    const { object: recipe } = await generateObject({
      model: defaultModel,
      schema: aiRecipeExtractionSchema,
      prompt: `Extract the recipe from this webpage. Parse ingredients with amount/unit/name separated. If you can't find a valid recipe, return a recipe with name "Unknown Recipe".\n\n${content}`,
    });

    return c.json({
      success: true,
      recipe: {
        ...recipe,
        sourceUrl: url,
        sourceType: "url" as const,
      },
    });
  })

  // POST /api/parties/wizard/extract-image - Extract recipe from image (for wizard)
  .post("/extract-image", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File | null;
    if (!imageFile) {
      return c.json({ error: "No image provided" }, 400);
    }

    // Convert to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    const base64 = btoa(binary);
    const dataUrl = `data:${imageFile.type};base64,${base64}`;

    // Dynamically import AI dependencies
    const { generateObject } = await import("ai");
    const { createAI } = await import("../../lib/ai");
    const { visionModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

    // Extract with vision model
    const { object: recipe } = await generateObject({
      model: visionModel,
      schema: aiRecipeExtractionSchema,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: dataUrl },
            {
              type: "text",
              text: "Extract the recipe from this image. Parse ingredients with amount/unit/name separated.",
            },
          ],
        },
      ],
    });

    return c.json({
      success: true,
      recipe: {
        ...recipe,
        sourceType: "photo" as const,
      },
    });
  })

  // Direct API endpoint to remove a menu item (bypasses AI for instant removal)
  .delete(
    "/menu-item",
    zValidator(
      "json",
      z.object({
        sessionId: z.string().uuid(),
        index: z.number().int().min(0),
        isNewRecipe: z.boolean(),
      })
    ),
    async (c) => {
      const user = await getUser(c);
      if (!user?.id) return c.json({ error: "Unauthorized" }, 401);

      const db = c.get("db");
      const { sessionId, index, isNewRecipe } = c.req.valid("json");

      // Fetch the session
      const session = await db.query.wizardSessions.findFirst({
        where: and(
          eq(wizardSessions.id, sessionId),
          eq(wizardSessions.userId, user.id)
        ),
      });

      if (!session) {
        return c.json({ error: "Session not found" }, 404);
      }

      // Deserialize the menu plan
      const deserialized = deserializeWizardSession(session);
      const menuPlan: MenuPlanData = deserialized.menuPlan || {
        existingRecipes: [],
        newRecipes: [],
      };

      let removedName: string;

      if (isNewRecipe) {
        if (index < 0 || index >= (menuPlan.newRecipes?.length || 0)) {
          return c.json({ error: "Invalid index" }, 400);
        }
        const removed = menuPlan.newRecipes!.splice(index, 1)[0];
        removedName = removed.name;

        // Remove from processedUrls if this was a URL-based recipe
        if (removed.sourceUrl && menuPlan.processedUrls) {
          menuPlan.processedUrls = menuPlan.processedUrls.filter(
            (url) => url !== removed.sourceUrl
          );
        }

        // Remove from processedImageHashes if this was an image-based recipe
        if (removed.imageHash && menuPlan.processedImageHashes) {
          menuPlan.processedImageHashes = menuPlan.processedImageHashes.filter(
            (hash) => hash !== removed.imageHash
          );
        }
      } else {
        if (index < 0 || index >= (menuPlan.existingRecipes?.length || 0)) {
          return c.json({ error: "Invalid index" }, 400);
        }
        const removed = menuPlan.existingRecipes!.splice(index, 1)[0];
        removedName = removed.name;
      }

      // Persist the updated menu plan
      await db
        .update(wizardSessions)
        .set({
          menuPlan: serializeMenuPlan(menuPlan),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(wizardSessions.id, sessionId),
            eq(wizardSessions.userId, user.id)
          )
        );

      return c.json({
        success: true,
        removedName,
        menuPlan,
      });
    }
  );

export type PartyWizardRoutes = typeof partyWizardRoutes;
export { partyWizardRoutes };
