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

interface ToolContext {
  db: ReturnType<typeof createDb>;
  userId: string;
  env: Env;
  currentData: Partial<WizardState>;
  sessionId?: string; // Session ID for persisting state
  writer?: UIMessageStreamWriter<WizardMessage>; // For emitting data parts (HITL)
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

export function getWizardTools(step: WizardStep, context: ToolContext): ToolSet {
  const { db, userId, env, currentData, sessionId, writer } = context;

  switch (step) {
    case "party-info":
      return {
        confirmPartyInfo: tool({
          description:
            "Confirm the party details when you have gathered all required information (name and date/time). Call this to request user confirmation before moving to the next step.",
          inputSchema: confirmPartyInfoToolSchema,
          execute: async (data) => {
            const partyInfo: PartyInfoData = {
              name: data.name,
              dateTime: data.dateTime,
              location: data.location,
              description: data.description,
              allowContributions: data.allowContributions || false,
            };

            // Save the data to session (but don't change step yet - wait for user approval)
            await updateSessionState(db, userId, sessionId, {
              partyInfo,
            });

            // Create confirmation request
            const request: StepConfirmationRequest = {
              id: crypto.randomUUID(),
              step: "party-info",
              nextStep: "guests",
              summary: `Party: ${data.name} on ${new Date(data.dateTime).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}${data.location ? ` at ${data.location}` : ""}`,
              data: { partyInfo },
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
              message: "Please confirm the party details above.",
            };
          },
        }),
      };

    case "guests":
      return {
        addGuest: tool({
          description:
            "Add a guest to the party. Requires at least an email OR phone number. Name is optional.",
          inputSchema: addGuestToolSchema,
          execute: async (data) => {
            const guestList: GuestData[] = [...(currentData.guestList || [])];
            guestList.push({
              name: data.name,
              email: data.email,
              phone: data.phone,
            });

            // Persist to session
            await updateSessionState(db, userId, sessionId, { guestList });

            return {
              success: true,
              action: "updateGuestList",
              guestList,
              message: `Added ${data.name || data.email || data.phone} to the guest list.`,
            };
          },
        }),
        removeGuest: tool({
          description: "Remove a guest from the list by their index (0-based).",
          inputSchema: removeGuestToolSchema,
          execute: async (data) => {
            const guestList: GuestData[] = [...(currentData.guestList || [])];
            if (data.index < 0 || data.index >= guestList.length) {
              return { success: false, error: "Invalid guest index" };
            }
            const removed = guestList.splice(data.index, 1)[0];

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
            "Confirm the guest list and request user approval to move to the next step. Can be called even with an empty list.",
          inputSchema: z.object({}),
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
            "Add a recipe from the user's library to the party menu. Use the recipe ID from the available recipes list.",
          inputSchema: addExistingRecipeToolSchema,
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
            "Import a recipe from a URL. The recipe will be extracted and added to the menu.",
          inputSchema: extractRecipeFromUrlToolSchema,
          execute: async (data) => {
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

            // Extract with AI
            const { object: recipe } = await generateObject({
              model: defaultModel,
              schema: aiRecipeExtractionSchema,
              prompt: `Extract the recipe from this webpage. Parse ingredients with amount/unit/name separated.\n\n${content}`,
            });

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

            // Persist to session
            await updateSessionState(db, userId, sessionId, { menuPlan });

            return {
              success: true,
              action: "updateMenuPlan",
              menuPlan,
              message: `Imported "${recipe.name}" from URL.`,
              recipe,
            };
          },
        }),
        generateRecipeIdea: tool({
          description:
            "Generate a new recipe based on a description. Good for when the user describes a dish they want.",
          inputSchema: generateRecipeIdeaToolSchema,
          execute: async (data) => {
            const { generateObject } = await import("ai");
            const { createAI } = await import("./ai");
            const { defaultModel } = createAI(env.GOOGLE_GENERATIVE_AI_API_KEY);

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
            });

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

            // Persist to session
            await updateSessionState(db, userId, sessionId, { menuPlan });

            return {
              success: true,
              action: "updateMenuPlan",
              menuPlan,
              message: `Created recipe for "${recipe.name}".`,
              recipe,
            };
          },
        }),
        removeMenuItem: tool({
          description:
            "Remove an item from the menu. Specify index and whether it's from existingRecipes or newRecipes.",
          inputSchema: removeMenuItemToolSchema,
          execute: async (data) => {
            const menuPlan: MenuPlanData = currentData.menuPlan
              ? { ...currentData.menuPlan, existingRecipes: [...(currentData.menuPlan.existingRecipes || [])], newRecipes: [...(currentData.menuPlan.newRecipes || [])] }
              : { existingRecipes: [], newRecipes: [] };

            if (data.isNewRecipe) {
              if (data.index < 0 || data.index >= menuPlan.newRecipes.length) {
                return { success: false, error: "Invalid index" };
              }
              const removed = menuPlan.newRecipes.splice(data.index, 1)[0];

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
            "Confirm the menu and request user approval to move to the timeline step. Can be called with an empty menu.",
          inputSchema: z.object({
            dietaryRestrictions: z.array(z.string()).optional(),
            ambitionLevel: z.enum(["simple", "moderate", "ambitious"]).optional(),
          }),
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
            "Generate a cooking timeline based on the menu and party date. Works backwards from the party time.",
          inputSchema: z.object({}),
          execute: async () => {
            const partyInfo = currentData.partyInfo;
            const menuPlan = currentData.menuPlan;

            if (!partyInfo) {
              return { success: false, error: "No party info available" };
            }

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

            const result = await generateObject({
              model: defaultModel,
              schema: z.object({ tasks: z.array(TimelineTaskSchema) }),
              prompt,
            });

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

            // Persist to session
            await updateSessionState(db, userId, sessionId, { timeline });

            return {
              success: true,
              action: "updateTimeline",
              timeline,
              message: `Created ${timeline.length} tasks for your cooking timeline.`,
            };
          },
        }),
        adjustTimeline: tool({
          description:
            "Adjust the timeline based on user feedback. Describe the changes you want to make.",
          inputSchema: z.object({
            changes: z.string().describe("Description of the changes to make"),
          }),
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

            const result = await generateObject({
              model: defaultModel,
              schema: z.object({ tasks: z.array(TimelineTaskSchema) }),
              prompt: `Adjust this cooking timeline based on the user's request.

Current timeline:
${JSON.stringify(currentTimeline, null, 2)}

Requested changes: ${data.changes}

Return the updated timeline with all tasks (keep unchanged tasks as-is, modify or add/remove as needed).`,
            });

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
            "Confirm the timeline and request user approval to finalize the party creation. This is the final step.",
          inputSchema: z.object({}),
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
