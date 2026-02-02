/**
 * Shared message types for the party wizard chat.
 *
 * Uses AI SDK v6 patterns:
 * - UIMessage<ImageParts, DataParts, ToolParts> generic params
 * - Custom data parts for HITL step confirmation flow
 */

import type { UIMessage, InferUITools } from "ai";
import type { getWizardTools } from "./party-wizard-tools";
import type { WizardStep, PartyInfoData, GuestData, MenuPlanData, TimelineTaskData } from "./wizard-schemas";

// Step confirmation request - AI sends when it has gathered step info
export type StepConfirmationRequest = {
  id: string;
  step: WizardStep;
  nextStep: WizardStep | "complete";
  summary: string;
  data: {
    partyInfo?: PartyInfoData;
    guestList?: GuestData[];
    menuPlan?: MenuPlanData;
    timeline?: TimelineTaskData[];
  };
};

// User's decision on step confirmation
export type StepConfirmationDecision =
  | { type: "approve" }
  | { type: "revise"; feedback: string };

// Extracted recipe data (from image or URL)
export type ExtractedRecipeData = {
  name: string;
  description?: string;
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
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  tags?: string[];
  sourceType: "photo" | "url" | "ai";
};

// Custom data parts for wizard-specific data in messages
export type WizardDataParts = {
  "step-confirmation-request": {
    request: StepConfirmationRequest;
  };
  "step-confirmation-decision": {
    requestId: string;
    decision: StepConfirmationDecision;
  };
  "step-confirmed": {
    requestId: string;
    step: WizardStep;
    nextStep: WizardStep | "complete";
  };
  "recipe-extracted": {
    recipe: ExtractedRecipeData;
    message: string;
  };
};

// Type the message with our tool definitions and data parts
export type WizardMessage = UIMessage<
  never, // No custom image parts
  WizardDataParts,
  InferUITools<ReturnType<typeof getWizardTools>>
>;
