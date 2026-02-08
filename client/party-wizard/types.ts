// Wizard steps
export type WizardStep = "party-info" | "guests" | "menu" | "timeline";

export const WIZARD_STEPS: WizardStep[] = ["party-info", "guests", "menu", "timeline"];

export const STEP_LABELS: Record<WizardStep, string> = {
  "party-info": "Party Info",
  guests: "Guests",
  menu: "Menu",
  timeline: "Timeline",
};

// Abbreviated labels for mobile
export const STEP_LABELS_SHORT: Record<WizardStep, string> = {
  "party-info": "Info",
  guests: "Guests",
  menu: "Menu",
  timeline: "Timeline",
};

// Party info data
export interface PartyInfoData {
  name: string;
  dateTime: Date | string;
  location?: string;
  description?: string;
  allowContributions?: boolean;
}

// Guest data
export interface GuestData {
  name?: string;
  email?: string;
  phone?: string;
}

// Menu item from user's library
export interface MenuItemData {
  recipeId: string;
  name: string;
  course?: "appetizer" | "main" | "side" | "dessert" | "drink";
  scaledServings?: number;
}

// New recipe to be created
export interface NewRecipeData {
  name: string;
  description?: string;
  sourceUrl?: string;
  sourceType?: "url" | "photo" | "ai" | "manual";
  imageHash?: string; // Hash of source image for deduplication tracking
  ingredients: Array<{
    amount?: string;
    unit?: string;
    ingredient: string;
    notes?: string;
  }>;
  instructions: Array<{
    step: number;
    description: string;
  }>;
  prepTimeMinutes?: number | null;
  cookTimeMinutes?: number | null;
  servings?: number | null;
  tags?: string[];
  dietaryTags?: string[];
  course?: "appetizer" | "main" | "side" | "dessert" | "drink";
}

// Menu plan
export interface MenuPlanData {
  existingRecipes: MenuItemData[];
  newRecipes: NewRecipeData[];
  dietaryRestrictions?: string[];
  ambitionLevel?: "simple" | "moderate" | "ambitious";
  processedUrls?: string[];
  processedImageHashes?: string[];
}

// Timeline task
export interface TimelineTaskData {
  recipeId?: string | null;
  recipeName?: string;
  description: string;
  daysBeforeParty: number;
  scheduledTime: string;
  durationMinutes: number;
  isPhaseStart?: boolean;
  phaseDescription?: string;
}

// Wizard session from server
export interface WizardSession {
  id: string;
  userId: string;
  currentStep: WizardStep;
  furthestStepIndex: number; // 0 = party-info, 1 = guests, 2 = menu, 3 = timeline
  partyInfo: PartyInfoData | null;
  guestList: GuestData[];
  menuPlan: MenuPlanData | null;
  timeline: TimelineTaskData[] | null;
  status: "active" | "completed" | "abandoned";
  partyId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

// Tool result types for handling AI responses
export interface ToolResultBase {
  success: boolean;
  action?: string;
  message?: string;
  error?: string;
}

export interface StepCompleteResult extends ToolResultBase {
  action: "stepComplete";
  nextStep: WizardStep;
  data?: PartyInfoData;
  guestCount?: number;
  menuPlan?: MenuPlanData;
  itemCount?: number;
}

export interface UpdateGuestListResult extends ToolResultBase {
  action: "updateGuestList";
  guestList: GuestData[];
}

export interface UpdateMenuPlanResult extends ToolResultBase {
  action: "updateMenuPlan";
  menuPlan: MenuPlanData;
  recipe?: NewRecipeData;
}

export interface UpdateTimelineResult extends ToolResultBase {
  action: "updateTimeline";
  timeline: TimelineTaskData[];
}

export interface WizardCompleteResult extends ToolResultBase {
  action: "wizardComplete";
}

export type ToolResult =
  | StepCompleteResult
  | UpdateGuestListResult
  | UpdateMenuPlanResult
  | UpdateTimelineResult
  | WizardCompleteResult
  | ToolResultBase;

// User recipe for menu step
export interface UserRecipe {
  id: string;
  name: string;
  description?: string | null;
}
