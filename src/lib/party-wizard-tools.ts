import { z } from "zod";
import { tool, type ToolSet, type UIMessageStreamWriter } from "ai";
import { eq, and } from "drizzle-orm";
import { recipes, wizardSessions } from "../../drizzle/schema";
import type {
  WizardStep,
  WizardState,
  TimelineTaskData,
  PartyInfoData,
  GuestData,
  MenuPlanData,
} from "./wizard-schemas";
import {
  confirmPartyInfoToolSchema,
  addGuestToolSchema,
  removeGuestToolSchema,
  addExistingRecipeToolSchema,
  generateRecipeIdeaToolSchema,
  extractRecipeFromUrlToolSchema,
  removeMenuItemToolSchema,
} from "./wizard-schemas";
import {
  serializePartyInfo,
  serializeGuestList,
  serializeMenuPlan,
  serializeTimeline,
} from "./wizard-session-serialization";
import { aiRecipeExtractionSchema } from "./schemas";
import type { WizardMessage, StepConfirmationRequest } from "./wizard-message-types";
import type { Env } from "../index";
import type { createDb } from "./db";
import { parsePartyDateTimeInput } from "./party-date-parser";
import {
  createLangfuseGeneration,
  endLangfuseGeneration,
  updateLangfuseGeneration,
} from "./langfuse";

// Schema for timeline task generation (used by both tool and workflow)
const TimelineTaskSchema = z.object({
  recipeId: z.string().nullable(),
  recipeName: z.string().optional(),
  description: z.string(),
  daysBeforeParty: z.number(),
  scheduledTime: z.string(),
  durationMinutes: z.number(),
  isPhaseStart: z.boolean(),
  phaseDescription: z.string().nullable(),
});

/**
 * Generate a cooking timeline for the party.
 * Extracted as a helper function to be used by both the generateTimeline tool
 * and the auto-generate workflow when entering the timeline step.
 */
export async function generateTimelineForParty(
  partyInfo: PartyInfoData,
  menuPlan: MenuPlanData | null | undefined,
  env: Env,
  telemetry?: {
    traceId?: string;
    sessionId?: string;
    userId?: string;
    step?: WizardStep;
    environment?: string;
  }
): Promise<TimelineTaskData[]> {
  const { generateObject } = await import("ai");
  const { createAI } = await import("./ai");
  const { defaultModel } = createAI(env.GOOGLE_GENERATIVE_AI_API_KEY);

  // Build menu summary
  const menuItems = [
    ...(menuPlan?.existingRecipes?.map((r) => r.name) || []),
    ...(menuPlan?.newRecipes?.map((r) => r.name) || []),
  ];

  const partyDate = new Date(partyInfo.dateTime);
  const partyTime = partyDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const prompt = `Create a cooking timeline for a party.

PARTY DETAILS:
- Serving time: ${partyDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} at ${partyTime}
- Menu items: ${menuItems.length > 0 ? menuItems.join(", ") : "No specific menu - create a general party prep timeline"}

Create a practical timeline that includes:
1. Grocery shopping (1-2 days before)
2. Any advance prep (day before)
3. Day-of cooking tasks with specific times
4. Final prep before guests arrive

For each task:
- daysBeforeParty: 0 = day of party, 1 = day before, etc.
- scheduledTime: 24h format like "09:00"
- durationMinutes: realistic time estimate
- isPhaseStart: true for major milestones (shopping, cooking start, final prep)
- phaseDescription: friendly reminder message for phase starts

Keep it manageable - don't overwhelm with too many tasks.`;

  const generation = createLangfuseGeneration(env, {
    traceId: telemetry?.traceId,
    name: "wizard.timeline.generateTimelineForParty",
    model: "gemini-2.5-flash",
    input: {
      partyName: partyInfo.name,
      menuItemCount: menuItems.length,
    },
    metadata: {
      sessionId: telemetry?.sessionId,
      step: telemetry?.step || "timeline",
    },
  });

  const result = await generateObject({
    model: defaultModel,
    schema: z.object({ tasks: z.array(TimelineTaskSchema) }),
    prompt,
    experimental_telemetry: telemetry?.traceId
      ? {
          isEnabled: true,
          functionId: "wizard.timeline.generateTimelineForParty",
          metadata: {
            langfuseTraceId: telemetry.traceId,
            wizardSessionId: telemetry.sessionId || "unknown",
            wizardStep: telemetry.step || "timeline",
            environment: telemetry.environment || "unknown",
          },
        }
      : undefined,
  });

  updateLangfuseGeneration(generation, {
    output: {
      taskCount: result.object.tasks.length,
    },
  });
  endLangfuseGeneration(generation);

  return result.object.tasks.map((task) => ({
    recipeId: null,
    recipeName: task.recipeName,
    description: task.description,
    daysBeforeParty: task.daysBeforeParty,
    scheduledTime: task.scheduledTime,
    durationMinutes: task.durationMinutes,
    isPhaseStart: task.isPhaseStart,
    phaseDescription: task.phaseDescription ?? undefined,
  }));
}

interface ToolContext {
  db: ReturnType<typeof createDb>;
  userId: string;
  env: Env;
  currentData: Partial<WizardState>;
  referenceNow?: Date;
  sessionId?: string; // Session ID for persisting state
  writer?: UIMessageStreamWriter<WizardMessage>; // For emitting data parts (HITL)
  telemetry?: {
    traceId?: string;
    sessionId?: string;
    userId?: string;
    step?: WizardStep;
    environment?: string;
  };
}

function getToolTelemetrySettings(
  context: ToolContext,
  functionId: string,
  metadata: Record<string, string | number | boolean | undefined> = {}
) {
  if (!context.telemetry?.traceId) return undefined;

  const cleanedMetadata: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined) cleanedMetadata[key] = value;
  }

  return {
    isEnabled: true,
    functionId,
    metadata: {
      langfuseTraceId: context.telemetry.traceId,
      wizardSessionId: context.telemetry.sessionId || context.sessionId || "unknown",
      wizardStep: context.telemetry.step || "unknown",
      environment: context.telemetry.environment || "unknown",
      ...cleanedMetadata,
    },
  };
}

// Helper to update session state in the database
// Converts runtime types to serialized DB types
async function updateSessionState(
  db: ReturnType<typeof createDb>,
  userId: string,
  sessionId: string | undefined,
  updates: {
    currentStep?: WizardStep;
    partyInfo?: PartyInfoData | null;
    guestList?: GuestData[];
    menuPlan?: MenuPlanData | null;
    timeline?: TimelineTaskData[] | null;
  }
): Promise<void> {
  if (!sessionId) return;

  // Serialize data for DB storage
  const serializedUpdates: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.currentStep !== undefined) {
    serializedUpdates.currentStep = updates.currentStep;
  }
  if (updates.partyInfo !== undefined) {
    serializedUpdates.partyInfo = updates.partyInfo ? serializePartyInfo(updates.partyInfo) : null;
  }
  if (updates.guestList !== undefined) {
    serializedUpdates.guestList = serializeGuestList(updates.guestList);
  }
  if (updates.menuPlan !== undefined) {
    serializedUpdates.menuPlan = updates.menuPlan ? serializeMenuPlan(updates.menuPlan) : null;
  }
  if (updates.timeline !== undefined) {
    serializedUpdates.timeline = updates.timeline ? serializeTimeline(updates.timeline) : null;
  }

  await db
    .update(wizardSessions)
    .set(serializedUpdates)
    .where(
      and(
        eq(wizardSessions.id, sessionId),
        eq(wizardSessions.userId, userId)
      )
    );
}

function cleanOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeGuestInput(data: {
  name?: string;
  email?: string;
  phone?: string;
}): GuestData | null {
  let name = cleanOptionalString(data.name);
  let email = cleanOptionalString(data.email);
  const phone = cleanOptionalString(data.phone);

  // Recover name-only entries when the model puts a name into the email field.
  if (email && !looksLikeEmail(email)) {
    if (!name) {
      name = email;
    }
    email = undefined;
  }

  if (!name && !email && !phone) {
    return null;
  }

  return {
    name,
    email,
    phone,
  };
}

export function getWizardTools(step: WizardStep, context: ToolContext): ToolSet {
  const { db, userId, env, currentData, sessionId, writer } = context;

  switch (step) {
    case "party-info":
      return {
        confirmPartyInfo: tool({
          description:
            "Save and confirm the party details. Call this when you have gathered the required information (party name and date/time). This shows a confirmation dialog to the user.",
          inputSchema: confirmPartyInfoToolSchema,
          inputExamples: [
            { input: { name: "Sarah's 30th Birthday", dateTimeInput: "next Saturday at 7pm", location: "My apartment", allowContributions: true } },
            { input: { name: "Summer BBQ", dateTimeInput: "July 4 at 4pm", description: "Casual backyard cookout", allowContributions: false } },
            { input: { name: "Dinner Party", dateTimeInput: "this weekend on Saturday at 6:30pm", allowContributions: false } },
          ] as const,
          execute: async (data) => {
            console.log("[confirmPartyInfo] Tool called with:", JSON.stringify(data));

            const rawDateInput = data.dateTimeInput || data.dateTime;
            const referenceNow = context.referenceNow || new Date();
            if (!rawDateInput) {
              return {
                success: false,
                error: "Missing date/time input.",
              };
            }

            const parsedDate = parsePartyDateTimeInput(rawDateInput, referenceNow);
            if (!parsedDate) {
              console.log("[confirmPartyInfo] ERROR: Could not parse date:", rawDateInput);
              return {
                success: false,
                error: "I couldn't understand that date/time. Please provide a specific date (e.g., \"Saturday at 7pm\" or \"March 15 at 6pm\").",
              };
            }

            // Convert string dateTime to Date for PartyInfoData
            const partyInfo: PartyInfoData = {
              name: data.name,
              dateTime: parsedDate,
              location: data.location,
              description: data.description,
              allowContributions: data.allowContributions || false,
            };

            console.log("[confirmPartyInfo] PartyInfo created:", JSON.stringify(partyInfo));

            // Save the data to session (but don't change step yet - wait for user approval)
            await updateSessionState(db, userId, sessionId, {
              partyInfo,
            });

            console.log("[confirmPartyInfo] Session updated");

            // Create confirmation request
            const request: StepConfirmationRequest = {
              id: crypto.randomUUID(),
              step: "party-info",
              nextStep: "guests",
              summary: `Party: ${data.name} on ${parsedDate.toLocaleString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}${data.location ? ` at ${data.location}` : ""}`,
              data: { partyInfo },
            };

            console.log("[confirmPartyInfo] Request created:", JSON.stringify(request));

            // Emit data part for HITL confirmation UI
            if (writer) {
              console.log("[confirmPartyInfo] Writing data part to stream");
              writer.write({
                type: "data-step-confirmation-request",
                data: { request },
              });
            } else {
              console.log("[confirmPartyInfo] WARNING: No writer available!");
            }

            return {
              success: true,
              action: "awaitingConfirmation",
              message: "Please confirm the party details above.",
            };
          },
        }),
      };

    case "guests":
      return {
        addGuest: tool({
          description:
            "Add a guest to the party invitation list. Call this IMMEDIATELY when the user provides guest details - do not just acknowledge in text. Name-only guests are allowed and contact details can be added later.",
          inputSchema: addGuestToolSchema,
          inputExamples: [
            { input: { name: "Sarah", email: "sarah@example.com" } },
            { input: { email: "friend@test.com" } },
            { input: { name: "Mom", phone: "+1-555-123-4567" } },
            { input: { name: "John Smith", email: "john@work.com", phone: "555-0123" } },
          ] as const,
          execute: async (data) => {
            const normalizedGuest = normalizeGuestInput(data);
            if (!normalizedGuest) {
              return {
                success: false,
                error: "Missing guest details.",
                message: "I need at least a name, email, or phone number to add a guest.",
              };
            }

            const guestList: GuestData[] = [...(currentData.guestList || [])];
            guestList.push(normalizedGuest);

            // Update currentData in place so subsequent tool calls see the change
            currentData.guestList = guestList;

            // Persist to session
            await updateSessionState(db, userId, sessionId, { guestList });

            return {
              success: true,
              action: "updateGuestList",
              guestList,
              message: normalizedGuest.email || normalizedGuest.phone
                ? `Added ${normalizedGuest.name || normalizedGuest.email || normalizedGuest.phone} to the guest list.`
                : `Added ${normalizedGuest.name || "guest"} to the guest list. You can add contact details later.`,
            };
          },
        }),
        removeGuest: tool({
          description:
            "Remove a guest from the invitation list. Call this when the user wants to remove someone they previously added.",
          inputSchema: removeGuestToolSchema,
          inputExamples: [
            { input: { index: 0 } },
            { input: { index: 2 } },
          ] as const,
          execute: async (data) => {
            const guestList: GuestData[] = [...(currentData.guestList || [])];
            if (data.index < 0 || data.index >= guestList.length) {
              return { success: false, error: "Invalid guest index" };
            }
            const removed = guestList.splice(data.index, 1)[0];

            // Update currentData in place so subsequent tool calls see the change
            currentData.guestList = guestList;

            // Persist to session
            await updateSessionState(db, userId, sessionId, { guestList });

            return {
              success: true,
              action: "updateGuestList",
              guestList,
              message: `Removed ${removed.name || removed.email || removed.phone} from the guest list.`,
            };
          },
        }),
        confirmGuestList: tool({
          description:
            "Finalize the guest list and show confirmation to the user. Call this when the user indicates they're done adding guests, or wants to proceed. Can be called with an empty list - guests can be added later.",
          inputSchema: z.object({}),
          inputExamples: [
            { input: {} },
          ] as const,
          execute: async () => {
            const guestList = currentData.guestList || [];
            const guestCount = guestList.length;
            const guestNames = guestList.slice(0, 3).map(g => g.name || g.email || g.phone).join(", ");

            // Create confirmation request
            const request: StepConfirmationRequest = {
              id: crypto.randomUUID(),
              step: "guests",
              nextStep: "menu",
              summary: guestCount === 0
                ? "No guests added yet (you can add them later)"
                : `${guestCount} guest${guestCount === 1 ? "" : "s"}: ${guestNames}${guestCount > 3 ? "..." : ""}`,
              data: { guestList },
            };

            // Emit data part for HITL confirmation UI
            if (writer) {
              writer.write({
                type: "data-step-confirmation-request",
                data: { request },
              });
            }

            return {
              success: true,
              action: "awaitingConfirmation",
              message: "Please confirm the guest list above.",
            };
          },
        }),
      };

    case "menu":
      return {
        addExistingRecipe: tool({
          description:
            "Add a recipe from the user's existing library to the menu. Use the recipe ID shown in the user-recipes list. Call this when the user wants to use one of their saved recipes.",
          inputSchema: addExistingRecipeToolSchema,
          inputExamples: [
            { input: { recipeId: "550e8400-e29b-41d4-a716-446655440000" } },
            { input: { recipeId: "550e8400-e29b-41d4-a716-446655440001", course: "main", scaledServings: 8 } },
          ] as const,
          execute: async (data) => {
            // Verify recipe exists and belongs to user
            const [recipe] = await db
              .select({ id: recipes.id, name: recipes.name })
              .from(recipes)
              .where(eq(recipes.id, data.recipeId));

            if (!recipe) {
              return { success: false, error: "Recipe not found" };
            }

            const menuPlan: MenuPlanData = currentData.menuPlan
              ? { ...currentData.menuPlan, existingRecipes: [...(currentData.menuPlan.existingRecipes || [])], newRecipes: [...(currentData.menuPlan.newRecipes || [])] }
              : { existingRecipes: [], newRecipes: [] };
            menuPlan.existingRecipes = [
              ...menuPlan.existingRecipes,
              {
                recipeId: recipe.id,
                name: recipe.name,
                course: data.course,
                scaledServings: data.scaledServings,
              },
            ];

            // Update currentData in place so subsequent tool calls see the change
            currentData.menuPlan = menuPlan;

            // Persist to session
            await updateSessionState(db, userId, sessionId, { menuPlan });

            return {
              success: true,
              action: "updateMenuPlan",
              menuPlan,
              message: `Added "${recipe.name}" to the menu.`,
            };
          },
        }),
        extractRecipeFromUrl: tool({
          description:
            "Import a recipe from a website URL. Call this when the user pastes or shares a recipe link. The recipe content will be extracted and added to the menu.",
          inputSchema: extractRecipeFromUrlToolSchema,
          inputExamples: [
            { input: { url: "https://www.seriouseats.com/classic-beef-stew-recipe" } },
            { input: { url: "https://cooking.nytimes.com/recipes/1234", course: "main" } },
          ] as const,
          execute: async (data) => {
            // Check if URL has already been processed
            const processedUrls = currentData.menuPlan?.processedUrls || [];
            if (processedUrls.includes(data.url)) {
              return { success: false, error: "This recipe URL has already been added to the menu." };
            }

            const { generateObject } = await import("ai");
            const { createAI } = await import("./ai");
            const { defaultModel } = createAI(env.GOOGLE_GENERATIVE_AI_API_KEY);

            // Fetch via Tavily
            const tavilyRes = await fetch("https://api.tavily.com/extract", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.TAVILY_API_KEY}`,
              },
              body: JSON.stringify({ urls: [data.url] }),
            });

            if (!tavilyRes.ok) {
              return { success: false, error: "Failed to fetch URL content" };
            }

            const tavilyData = (await tavilyRes.json()) as {
              results: Array<{ raw_content?: string; content?: string }>;
            };
            const content =
              tavilyData.results[0]?.raw_content || tavilyData.results[0]?.content;

            if (!content) {
              return { success: false, error: "Could not extract content from URL" };
            }

            const extractionGeneration = createLangfuseGeneration(env, {
              traceId: context.telemetry?.traceId,
              name: "wizard.menu.extractRecipeFromUrl",
              model: "gemini-2.5-flash",
              input: {
                sourceUrl: data.url,
                contentLength: content.length,
              },
              metadata: {
                sessionId: context.telemetry?.sessionId || sessionId,
                step: context.telemetry?.step || step,
              },
            });

            // Extract with AI
            const { object: recipe } = await generateObject({
              model: defaultModel,
              schema: aiRecipeExtractionSchema,
              prompt: `Extract the recipe from this webpage. Parse ingredients with amount/unit/name separated.\n\n${content}`,
              experimental_telemetry: getToolTelemetrySettings(
                context,
                "wizard.menu.extractRecipeFromUrl.generateObject",
                {
                  sourceUrl: data.url,
                  contentLength: content.length,
                }
              ),
            });

            updateLangfuseGeneration(extractionGeneration, {
              output: {
                recipeName: recipe.name,
                ingredientCount: recipe.ingredients?.length ?? 0,
                instructionCount: recipe.instructions?.length ?? 0,
              },
            });
            endLangfuseGeneration(extractionGeneration);

            const menuPlan: MenuPlanData = currentData.menuPlan
              ? { ...currentData.menuPlan, existingRecipes: [...(currentData.menuPlan.existingRecipes || [])], newRecipes: [...(currentData.menuPlan.newRecipes || [])] }
              : { existingRecipes: [], newRecipes: [] };
            menuPlan.newRecipes = [
              ...menuPlan.newRecipes,
              {
                ...recipe,
                sourceUrl: data.url,
                sourceType: "url" as const,
                course: data.course,
              },
            ];

            // Track this URL as processed to prevent duplicates
            menuPlan.processedUrls = [...(menuPlan.processedUrls || []), data.url];

            // Update currentData in place so subsequent tool calls see the change
            currentData.menuPlan = menuPlan;

            // Persist to session
            await updateSessionState(db, userId, sessionId, { menuPlan });

            // Emit recipe data part for client rendering (consistent with image workflow)
            const responseMessage = `I imported "${recipe.name}" from that URL and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.`;
            if (writer) {
              writer.write({
                type: "data-recipe-extracted",
                data: {
                  recipe: {
                    ...recipe,
                    sourceType: "url" as const,
                  },
                  message: responseMessage,
                },
              });
            }

            return {
              success: true,
              action: "updateMenuPlan",
              menuPlan,
              message: responseMessage,
              recipe,
            };
          },
        }),
        generateRecipeIdea: tool({
          description:
            "Create a new recipe based on a description. Call this when the user describes a dish they want to make but don't have a specific recipe for. Generates a complete recipe with ingredients and instructions.",
          inputSchema: generateRecipeIdeaToolSchema,
          inputExamples: [
            { input: { description: "a light summer salad with citrus and avocado" } },
            { input: { description: "classic beef bourguignon", course: "main" } },
            { input: { description: "easy chocolate mousse", course: "dessert" } },
          ] as const,
          execute: async (data) => {
            const { generateObject } = await import("ai");
            const { createAI } = await import("./ai");
            const { defaultModel } = createAI(env.GOOGLE_GENERATIVE_AI_API_KEY);

            const generation = createLangfuseGeneration(env, {
              traceId: context.telemetry?.traceId,
              name: "wizard.menu.generateRecipeIdea",
              model: "gemini-2.5-flash",
              input: {
                description: data.description,
                course: data.course,
              },
              metadata: {
                sessionId: context.telemetry?.sessionId || sessionId,
                step: context.telemetry?.step || step,
              },
            });

            const { object: recipe } = await generateObject({
              model: defaultModel,
              schema: aiRecipeExtractionSchema,
              prompt: `Create a detailed recipe for: ${data.description}

Include:
- A clear, appetizing name
- Complete ingredient list with amounts
- Step-by-step instructions
- Prep and cook times
- Number of servings

Make the recipe practical and achievable for a home cook.`,
              experimental_telemetry: getToolTelemetrySettings(
                context,
                "wizard.menu.generateRecipeIdea.generateObject",
                {
                  hasCourse: Boolean(data.course),
                }
              ),
            });

            updateLangfuseGeneration(generation, {
              output: {
                recipeName: recipe.name,
                ingredientCount: recipe.ingredients?.length ?? 0,
                instructionCount: recipe.instructions?.length ?? 0,
              },
            });
            endLangfuseGeneration(generation);

            const menuPlan: MenuPlanData = currentData.menuPlan
              ? { ...currentData.menuPlan, existingRecipes: [...(currentData.menuPlan.existingRecipes || [])], newRecipes: [...(currentData.menuPlan.newRecipes || [])] }
              : { existingRecipes: [], newRecipes: [] };
            menuPlan.newRecipes = [
              ...menuPlan.newRecipes,
              {
                ...recipe,
                sourceType: "ai" as const,
                course: data.course,
              },
            ];

            // Update currentData in place so subsequent tool calls see the change
            currentData.menuPlan = menuPlan;

            // Persist to session
            await updateSessionState(db, userId, sessionId, { menuPlan });

            // Emit recipe data part for client rendering (consistent with image/URL workflows)
            const responseMessage = `I created "${recipe.name}" for you and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.`;
            if (writer) {
              writer.write({
                type: "data-recipe-extracted",
                data: {
                  recipe: {
                    ...recipe,
                    sourceType: "ai" as const,
                  },
                  message: responseMessage,
                },
              });
            }

            return {
              success: true,
              action: "updateMenuPlan",
              menuPlan,
              message: responseMessage,
              recipe,
            };
          },
        }),
        removeMenuItem: tool({
          description:
            "Remove a dish from the menu. Call this when the user wants to remove something they previously added. Use isNewRecipe=true for AI-generated or imported recipes, false for recipes from their library.",
          inputSchema: removeMenuItemToolSchema,
          inputExamples: [
            { input: { index: 0, isNewRecipe: false } },
            { input: { index: 1, isNewRecipe: true } },
          ] as const,
          execute: async (data) => {
            const menuPlan: MenuPlanData = currentData.menuPlan
              ? { ...currentData.menuPlan, existingRecipes: [...(currentData.menuPlan.existingRecipes || [])], newRecipes: [...(currentData.menuPlan.newRecipes || [])] }
              : { existingRecipes: [], newRecipes: [] };

            if (data.isNewRecipe) {
              if (data.index < 0 || data.index >= menuPlan.newRecipes.length) {
                return { success: false, error: "Invalid index" };
              }
              const removed = menuPlan.newRecipes.splice(data.index, 1)[0];

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

              // Update currentData in place so subsequent tool calls see the change
              currentData.menuPlan = menuPlan;

              // Persist to session
              await updateSessionState(db, userId, sessionId, { menuPlan });

              return {
                success: true,
                action: "updateMenuPlan",
                menuPlan,
                message: `Removed "${removed.name}" from the menu.`,
              };
            } else {
              if (data.index < 0 || data.index >= menuPlan.existingRecipes.length) {
                return { success: false, error: "Invalid index" };
              }
              const removed = menuPlan.existingRecipes.splice(data.index, 1)[0];

              // Update currentData in place so subsequent tool calls see the change
              currentData.menuPlan = menuPlan;

              // Persist to session
              await updateSessionState(db, userId, sessionId, { menuPlan });

              return {
                success: true,
                action: "updateMenuPlan",
                menuPlan,
                message: `Removed "${removed.name}" from the menu.`,
              };
            }
          },
        }),
        confirmMenu: tool({
          description:
            "Finalize the menu and show confirmation to the user. Call this when the user is satisfied with their menu or wants to proceed. Can be called with an empty menu - recipes can be added later.",
          inputSchema: z.object({
            dietaryRestrictions: z.array(z.string()).optional().describe("Any dietary restrictions mentioned (e.g., 'vegetarian', 'gluten-free')"),
            ambitionLevel: z.enum(["simple", "moderate", "ambitious"]).optional().describe("How complex the cooking will be"),
          }),
          inputExamples: [
            { input: {} },
            { input: { dietaryRestrictions: ["vegetarian"], ambitionLevel: "moderate" } },
          ] as const,
          execute: async (data) => {
            const menuPlan: MenuPlanData = currentData.menuPlan
              ? { ...currentData.menuPlan }
              : { existingRecipes: [], newRecipes: [] };
            menuPlan.dietaryRestrictions = data.dietaryRestrictions;
            menuPlan.ambitionLevel = data.ambitionLevel;

            // Save menu plan (but don't change step yet - wait for user approval)
            await updateSessionState(db, userId, sessionId, { menuPlan });

            const itemCount = (menuPlan.existingRecipes?.length || 0) + (menuPlan.newRecipes?.length || 0);
            const recipeNames = [
              ...menuPlan.existingRecipes.map(r => r.name),
              ...menuPlan.newRecipes.map(r => r.name),
            ].slice(0, 3).join(", ");

            // Create confirmation request
            const request: StepConfirmationRequest = {
              id: crypto.randomUUID(),
              step: "menu",
              nextStep: "timeline",
              summary: itemCount === 0
                ? "No recipes added yet"
                : `${itemCount} recipe${itemCount === 1 ? "" : "s"}: ${recipeNames}${itemCount > 3 ? "..." : ""}`,
              data: { menuPlan },
            };

            // Emit data part for HITL confirmation UI
            if (writer) {
              writer.write({
                type: "data-step-confirmation-request",
                data: { request },
              });
            }

            return {
              success: true,
              action: "awaitingConfirmation",
              message: "Please confirm the menu above.",
            };
          },
        }),
      };

    case "timeline":
      return {
        generateTimeline: tool({
          description:
            "Create a cooking timeline/schedule for the party. Call this to generate a detailed prep schedule based on the menu items and party date. Works backwards from party time to include shopping, prep, and cooking tasks.",
          inputSchema: z.object({}),
          inputExamples: [
            { input: {} },
          ] as const,
          execute: async () => {
            const partyInfo = currentData.partyInfo;
            const menuPlan = currentData.menuPlan;

            if (!partyInfo) {
              return { success: false, error: "No party info available" };
            }

            // Use the shared helper function
            const timeline = await generateTimelineForParty(partyInfo, menuPlan, env, context.telemetry);

            // Update currentData in place so subsequent tool calls see the change
            currentData.timeline = timeline;

            // Persist to session
            await updateSessionState(db, userId, sessionId, { timeline });

            const responseMessage = `Created ${timeline.length} tasks for your cooking timeline.`;

            // Emit data part for interactive timeline preview
            if (writer) {
              writer.write({
                type: "data-timeline-generated",
                data: { timeline, message: responseMessage },
              });
            }

            return {
              success: true,
              action: "updateTimeline",
              timeline,
              message: responseMessage,
            };
          },
        }),
        adjustTimeline: tool({
          description:
            "Modify the cooking timeline based on user feedback. Call this when the user wants to change timing, add tasks, remove tasks, or reorganize the schedule.",
          inputSchema: z.object({
            changes: z.string().describe("What to change (e.g., 'move salad prep to 2pm', 'add 30 min buffer before guests arrive')"),
          }),
          inputExamples: [
            { input: { changes: "Move the salad prep earlier, around 2pm" } },
            { input: { changes: "Add more buffer time before guests arrive" } },
            { input: { changes: "Remove the grocery shopping task - I already have everything" } },
          ] as const,
          execute: async (data) => {
            const currentTimeline = currentData.timeline || [];

            const { generateObject } = await import("ai");
            const { createAI } = await import("./ai");
            const { defaultModel } = createAI(env.GOOGLE_GENERATIVE_AI_API_KEY);

            const TimelineTaskSchema = z.object({
              recipeId: z.string().nullable(),
              recipeName: z.string().optional(),
              description: z.string(),
              daysBeforeParty: z.number(),
              scheduledTime: z.string(),
              durationMinutes: z.number(),
              isPhaseStart: z.boolean(),
              phaseDescription: z.string().nullable(),
            });

            const timelineAdjustmentGeneration = createLangfuseGeneration(env, {
              traceId: context.telemetry?.traceId,
              name: "wizard.timeline.adjustTimeline",
              model: "gemini-2.5-flash",
              input: {
                currentTimelineCount: currentTimeline.length,
                requestedChanges: data.changes,
              },
              metadata: {
                sessionId: context.telemetry?.sessionId || sessionId,
                step: context.telemetry?.step || step,
              },
            });

            const result = await generateObject({
              model: defaultModel,
              schema: z.object({ tasks: z.array(TimelineTaskSchema) }),
              prompt: `Adjust this cooking timeline based on the user's request.

Current timeline:
${JSON.stringify(currentTimeline, null, 2)}

Requested changes: ${data.changes}

Return the updated timeline with all tasks (keep unchanged tasks as-is, modify or add/remove as needed).`,
              experimental_telemetry: getToolTelemetrySettings(
                context,
                "wizard.timeline.adjustTimeline.generateObject",
                {
                  currentTimelineCount: currentTimeline.length,
                }
              ),
            });

            updateLangfuseGeneration(timelineAdjustmentGeneration, {
              output: {
                timelineTaskCount: result.object.tasks.length,
              },
            });
            endLangfuseGeneration(timelineAdjustmentGeneration);

            const timeline: TimelineTaskData[] = result.object.tasks.map((task) => ({
              recipeId: null,
              recipeName: task.recipeName,
              description: task.description,
              daysBeforeParty: task.daysBeforeParty,
              scheduledTime: task.scheduledTime,
              durationMinutes: task.durationMinutes,
              isPhaseStart: task.isPhaseStart,
              phaseDescription: task.phaseDescription ?? undefined,
            }));

            // Update currentData in place so subsequent tool calls see the change
            currentData.timeline = timeline;

            // Persist to session
            await updateSessionState(db, userId, sessionId, { timeline });

            return {
              success: true,
              action: "updateTimeline",
              timeline,
              message: "Timeline updated based on your feedback.",
            };
          },
        }),
        confirmTimeline: tool({
          description:
            "Finalize the timeline and show confirmation to the user. Call this when the user is happy with the schedule. This is the final step before creating the party.",
          inputSchema: z.object({}),
          inputExamples: [
            { input: {} },
          ] as const,
          execute: async () => {
            const timeline = currentData.timeline || [];
            const taskCount = timeline.length;
            const phaseCount = timeline.filter(t => t.isPhaseStart).length;

            // Create confirmation request
            const request: StepConfirmationRequest = {
              id: crypto.randomUUID(),
              step: "timeline",
              nextStep: "complete",
              summary: taskCount === 0
                ? "No timeline tasks created"
                : `${taskCount} task${taskCount === 1 ? "" : "s"} across ${phaseCount} phase${phaseCount === 1 ? "" : "s"}`,
              data: { timeline },
            };

            // Emit data part for HITL confirmation UI
            if (writer) {
              writer.write({
                type: "data-step-confirmation-request",
                data: { request },
              });
            }

            return {
              success: true,
              action: "awaitingConfirmation",
              message: "Please confirm the timeline above to create your party.",
            };
          },
        }),
      };

    default:
      return {};
  }
}
