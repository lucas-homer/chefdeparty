import { z } from "zod";
import { courseSchema, ingredientSchema, instructionSchema, dietaryTagSchema } from "./schemas";

// ============================================
// Wizard Step Types
// ============================================

export const wizardStepSchema = z.enum(["party-info", "guests", "menu", "timeline"]);
export type WizardStep = z.infer<typeof wizardStepSchema>;

// ============================================
// Party Info Step
// ============================================

export const partyInfoDataSchema = z.object({
  name: z.string().min(1, "Party name is required"),
  dateTime: z.coerce.date(),
  location: z.string().optional(),
  description: z.string().optional(),
  allowContributions: z.boolean().default(false),
});

export type PartyInfoData = z.infer<typeof partyInfoDataSchema>;

// ============================================
// Guest Step
// ============================================

export const guestDataSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).refine(
  (data) => data.email || data.phone,
  { message: "Either email or phone is required" }
);

export type GuestData = z.infer<typeof guestDataSchema>;

// ============================================
// Menu Step
// ============================================

export const menuItemDataSchema = z.object({
  recipeId: z.string().uuid(),
  name: z.string(),
  course: courseSchema.optional(),
  scaledServings: z.number().int().positive().optional(),
});

export type MenuItemData = z.infer<typeof menuItemDataSchema>;

// New recipe to be created (from AI generation, URL import, or image import)
export const newRecipeDataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceType: z.enum(["url", "photo", "ai", "manual"]).optional(),
  ingredients: z.array(ingredientSchema),
  instructions: z.array(instructionSchema),
  prepTimeMinutes: z.number().int().positive().optional().nullable(),
  cookTimeMinutes: z.number().int().positive().optional().nullable(),
  servings: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  dietaryTags: z.array(dietaryTagSchema).optional(),
  course: courseSchema.optional(),
});

export type NewRecipeData = z.infer<typeof newRecipeDataSchema>;

export const menuPlanDataSchema = z.object({
  existingRecipes: z.array(menuItemDataSchema), // Recipes from user's library
  newRecipes: z.array(newRecipeDataSchema), // Recipes to be created
  dietaryRestrictions: z.array(z.string()).optional(),
  ambitionLevel: z.enum(["simple", "moderate", "ambitious"]).optional(),
});

export type MenuPlanData = z.infer<typeof menuPlanDataSchema>;

// ============================================
// Timeline Step
// ============================================

export const timelineTaskDataSchema = z.object({
  recipeId: z.string().uuid().nullable().optional(),
  recipeName: z.string().optional(), // For display purposes
  description: z.string(),
  daysBeforeParty: z.number().int().min(0),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:MM format"),
  durationMinutes: z.number().int().positive(),
  isPhaseStart: z.boolean().default(false),
  phaseDescription: z.string().optional(),
});

export type TimelineTaskData = z.infer<typeof timelineTaskDataSchema>;

// ============================================
// Wizard State (for chat endpoint)
// ============================================

export const wizardStateSchema = z.object({
  step: wizardStepSchema,
  partyInfo: partyInfoDataSchema.nullable(),
  guestList: z.array(guestDataSchema),
  menuPlan: menuPlanDataSchema.nullable(),
  timeline: z.array(timelineTaskDataSchema).nullable(),
});

export type WizardState = z.infer<typeof wizardStateSchema>;

// ============================================
// Chat Request Schema
// ============================================

// Message format from Vercel AI SDK
export const aiMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const wizardChatRequestSchema = z.object({
  step: wizardStepSchema,
  messages: z.array(z.any()), // Vercel AI SDK message format
  currentData: wizardStateSchema.partial(),
  attachments: z.array(z.object({
    type: z.enum(["url", "image"]),
    content: z.string(), // URL string or base64 data URL
  })).optional(),
});

export type WizardChatRequest = z.infer<typeof wizardChatRequestSchema>;

// ============================================
// Complete Wizard Request Schema
// ============================================

export const wizardCompleteRequestSchema = z.object({
  partyInfo: partyInfoDataSchema,
  guestList: z.array(guestDataSchema),
  menuPlan: menuPlanDataSchema,
  timeline: z.array(timelineTaskDataSchema),
});

export type WizardCompleteRequest = z.infer<typeof wizardCompleteRequestSchema>;

// ============================================
// Tool Result Schemas (for AI tool calls)
// ============================================

// Party Info Tool
export const confirmPartyInfoToolSchema = partyInfoDataSchema;

// Guest Tools
export const addGuestToolSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
}).refine(
  (data) => data.email || data.phone,
  { message: "Either email or phone is required" }
);

export const removeGuestToolSchema = z.object({
  index: z.number().int().min(0),
});

// Menu Tools
export const addExistingRecipeToolSchema = z.object({
  recipeId: z.string().uuid(),
  course: courseSchema.optional(),
  scaledServings: z.number().int().positive().optional(),
});

export const generateRecipeIdeaToolSchema = z.object({
  description: z.string().describe("Description of the dish to generate"),
  course: courseSchema.optional().describe("Course type for the dish"),
});

export const extractRecipeFromUrlToolSchema = z.object({
  url: z.string().url(),
  course: courseSchema.optional(),
});

export const proposeMenuToolSchema = z.object({
  constraints: z.string().describe("Dietary restrictions, theme, or other constraints"),
  ambitionLevel: z.enum(["simple", "moderate", "ambitious"]).optional(),
});

export const removeMenuItemToolSchema = z.object({
  index: z.number().int().min(0),
  isNewRecipe: z.boolean().describe("Whether this is from newRecipes array or existingRecipes array"),
});

// Timeline Tools
export const adjustTimelineToolSchema = z.object({
  changes: z.string().describe("Description of the changes to make to the timeline"),
});
