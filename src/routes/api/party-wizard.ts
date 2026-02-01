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

    const userMessage: SerializedUIMessage = {
      id: userMessageId,
      role: "user",
      content: textContent,
      parts: parts.length > 0 ? parts : [{ type: "text", text: textContent }],
      createdAt: incomingMessage.createdAt || new Date().toISOString(),
    };

    // Save user message to DB
    await db.insert(wizardMessages).values({
      sessionId,
      step,
      message: userMessage,
    });

    // Reconstruct full message history: existing + new user message
    const allMessages = [
      ...existingMessages.map((m) => m.message),
      userMessage,
    ];

    console.log("[wizard/chat] Step:", step, "Messages count:", allMessages.length);

    // Dynamically import AI dependencies
    const {
      streamText,
      convertToModelMessages,
      stepCountIs,
      hasToolCall,
      createUIMessageStream,
      createUIMessageStreamResponse,
    } = await import("ai");
    const { createAI } = await import("../../lib/ai");
    const { defaultModel, visionModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

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
              if (nextStep !== "complete") {
                await db
                  .update(wizardSessions)
                  .set({ currentStep: nextStep, updatedAt: new Date() })
                  .where(
                    and(
                      eq(wizardSessions.id, sessionId),
                      eq(wizardSessions.userId, user.id)
                    )
                  );
                step = nextStep;
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
            const revisionContext = `

IMPORTANT - REVISION IN PROGRESS:
The user was shown a confirmation dialog and clicked "Make Changes" with this feedback:
"${revisionFeedback}"

Your task:
1. Incorporate the user's requested changes
2. Call the ${confirmationToolName} tool again IMMEDIATELY with the updated information
3. Do NOT ask for confirmation verbally - just call the tool

Previous confirmation summary: "${pendingConfirmationRequest.data.request.summary}"`;

            currentSystemPrompt += revisionContext;
          }

          // Convert messages to model format
          // For step transitions after approval, start fresh
          // For revisions, include the message history so AI has context
          const messagesToConvert = bodyDecision?.decision.type === "approve" && pendingConfirmationRequest
            ? [] // Start fresh for new step
            : allMessages;
          const modelMessages = await convertToModelMessages(messagesToConvert as WizardMessage[]);

          console.log("[wizard/chat] Model messages count:", modelMessages.length);

          const result = streamText({
            model: step === "menu" && hasImage ? visionModel : defaultModel,
            system: currentSystemPrompt,
            messages: modelMessages,
            tools,
            // For revision requests, force the AI to call the confirmation tool
            toolChoice: isRevisionRequest && confirmationToolName
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

          // Save assistant response message to DB
          // Convert to serializable format
          const responseParts: Array<Record<string, unknown>> = responseMessage.parts.map((part) => {
            // Spread the part to convert to plain object
            return { ...part };
          });

          const assistantMessage: SerializedUIMessage = {
            id: responseMessage.id,
            role: "assistant",
            content: "", // Content is in parts in v6
            parts: responseParts,
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
  });

export type PartyWizardRoutes = typeof partyWizardRoutes;
export { partyWizardRoutes };
