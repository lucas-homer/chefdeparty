import { z } from "zod";

// ============================================
// Recipe Schemas
// ============================================

export const ingredientSchema = z.object({
  amount: z.string().optional(),
  unit: z.string().optional(),
  ingredient: z.string(),
  notes: z.string().optional(),
  section: z.string().optional(),
});

export const instructionSchema = z.object({
  step: z.number(),
  description: z.string(),
  section: z.string().optional(),
});

export const dietaryTagSchema = z.enum([
  "vegetarian",
  "vegan",
  "gluten-free",
  "dairy-free",
  "nut-free",
  "contains-alcohol",
  "contains-eggs",
  "contains-dairy",
  "contains-nuts",
  "contains-shellfish",
  "contains-fish",
]);

export const sourceTypeSchema = z.enum(["url", "photo", "ai", "manual"]);

export const createRecipeSchema = z.object({
  name: z.string().min(1, "Recipe name is required"),
  description: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceType: sourceTypeSchema.optional(),
  ingredients: z.array(ingredientSchema),
  instructions: z.array(instructionSchema),
  prepTimeMinutes: z.number().int().positive().optional().nullable(),
  cookTimeMinutes: z.number().int().positive().optional().nullable(),
  servings: z.number().int().positive().optional().nullable(),
  tags: z.array(z.string()).optional(),
  dietaryTags: z.array(dietaryTagSchema).optional(),
});

// Simplified schema for AI extraction (avoids Google API issues with complex unions)
export const aiRecipeExtractionSchema = z.object({
  name: z.string().describe("The recipe name"),
  description: z.string().optional().describe("A brief description of the dish"),
  ingredients: z.array(z.object({
    amount: z.string().optional().describe("The quantity, e.g. '2', '1/2'"),
    unit: z.string().optional().describe("The unit, e.g. 'cups', 'tbsp', 'lb'"),
    ingredient: z.string().describe("The ingredient name"),
    notes: z.string().optional().describe("Preparation notes, e.g. 'diced', 'room temperature'"),
  })).describe("List of ingredients"),
  instructions: z.array(z.object({
    step: z.number().describe("Step number starting from 1"),
    description: z.string().describe("The instruction text"),
  })).describe("Cooking instructions in order"),
  prepTimeMinutes: z.number().optional().describe("Preparation time in minutes"),
  cookTimeMinutes: z.number().optional().describe("Cooking time in minutes"),
  servings: z.number().optional().describe("Number of servings"),
  tags: z.array(z.string()).optional().describe("Recipe tags like 'quick', 'comfort food'"),
});

export const updateRecipeSchema = createRecipeSchema.partial();

export const importUrlSchema = z.object({
  url: z.string().url("Please provide a valid URL"),
});

// ============================================
// Party Schemas
// ============================================

export const createPartySchema = z.object({
  name: z.string().min(1, "Party name is required"),
  description: z.string().optional(),
  dateTime: z.coerce.date(),
  location: z.string().optional(),
});

export const updatePartySchema = createPartySchema.partial();

// ============================================
// Guest Schemas
// ============================================

export const rsvpStatusSchema = z.enum(["pending", "yes", "no", "maybe"]);

// Base guest schema without refinement (for partial/updates)
const baseGuestSchema = z.object({
  name: z.string().optional(),
  email: z.string().email("Please provide a valid email").optional(),
  phone: z.string().optional(), // E.164 format preferred
  rsvpStatus: rsvpStatusSchema.optional(),
  headcount: z.number().int().positive().optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
});

export const createGuestSchema = baseGuestSchema.refine(
  (data) => data.email || data.phone,
  { message: "Either email or phone is required" }
);

export const updateGuestSchema = baseGuestSchema.partial();

// ============================================
// Party Menu Schemas
// ============================================

export const courseSchema = z.enum([
  "appetizer",
  "main",
  "side",
  "dessert",
  "drink",
]);

export const addToMenuSchema = z.object({
  recipeId: z.string().uuid(),
  scaledServings: z.number().int().positive().optional(),
  course: courseSchema.optional(),
});

export const updateMenuItemSchema = z.object({
  scaledServings: z.number().int().positive().optional(),
  course: courseSchema.optional(),
});

// ============================================
// Timeline Task Schemas
// ============================================

export const updateTimelineTaskSchema = z.object({
  completed: z.boolean(),
});

// ============================================
// Invite Schemas
// ============================================

export const inviteGuestsSchema = z.object({
  emails: z.array(z.string().email()).min(1, "At least one email is required"),
});

export const rsvpResponseSchema = z.object({
  rsvpStatus: rsvpStatusSchema,
  headcount: z.number().int().positive().optional(),
  dietaryRestrictions: z.array(z.string()).optional(),
});

// ============================================
// Chat/AI Schemas
// ============================================

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const generateRecipeSchema = z.object({
  messages: z.array(chatMessageSchema),
});

// ============================================
// Type Exports (inferred from Zod schemas)
// ============================================

export type Ingredient = z.infer<typeof ingredientSchema>;
export type Instruction = z.infer<typeof instructionSchema>;
export type DietaryTag = z.infer<typeof dietaryTagSchema>;
export type SourceType = z.infer<typeof sourceTypeSchema>;

export type CreateRecipe = z.infer<typeof createRecipeSchema>;
export type UpdateRecipe = z.infer<typeof updateRecipeSchema>;

export type CreateParty = z.infer<typeof createPartySchema>;
export type UpdateParty = z.infer<typeof updatePartySchema>;

export type RsvpStatus = z.infer<typeof rsvpStatusSchema>;
export type CreateGuest = z.infer<typeof createGuestSchema>;
export type UpdateGuest = z.infer<typeof updateGuestSchema>;

export type Course = z.infer<typeof courseSchema>;
export type AddToMenu = z.infer<typeof addToMenuSchema>;
export type UpdateMenuItem = z.infer<typeof updateMenuItemSchema>;

export type UpdateTimelineTask = z.infer<typeof updateTimelineTaskSchema>;

export type InviteGuests = z.infer<typeof inviteGuestsSchema>;
export type RsvpResponse = z.infer<typeof rsvpResponseSchema>;

// ============================================
// Phone Auth Schemas
// ============================================

export const sendOtpSchema = z.object({
  phone: z.string().min(1, "Phone number is required"),
  inviteCode: z.string().optional(), // For new user registration
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(1, "Phone number is required"),
  code: z.string().length(6, "Code must be 6 digits").regex(/^\d{6}$/, "Code must be 6 digits"),
});

export type SendOtp = z.infer<typeof sendOtpSchema>;
export type VerifyOtp = z.infer<typeof verifyOtpSchema>;
