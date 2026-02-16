/**
 * Party Wizard Step Handlers
 *
 * Dispatches wizard chat requests to the appropriate step handler.
 * Each step handler manages its own AI interactions and workflows.
 */

import type { HandlerContext, StepHandler } from "./utils";
import { handlePartyInfoStep } from "./party-info";
import { handleGuestsStep } from "./guests";
import { handleMenuStep } from "./menu";
import { handleTimelineStep } from "./timeline";

/**
 * Route a wizard chat request to the appropriate step handler.
 */
export async function handleWizardStep(ctx: HandlerContext): Promise<Response> {
  const handlers: Record<string, StepHandler> = {
    "party-info": handlePartyInfoStep,
    "guests": handleGuestsStep,
    "menu": handleMenuStep,
    "timeline": handleTimelineStep,
  };

  const handler = handlers[ctx.step];
  if (!handler) {
    return new Response(JSON.stringify({ error: `Unknown step: ${ctx.step}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return handler(ctx);
}

// Re-export utilities and types for external use
export type { HandlerContext, StepHandler, ConfirmationDecision } from "./utils";
export {
  stripLargeDataForStorage,
  loadAndValidateSession,
  loadStepMessages,
  saveUserMessage,
  saveAssistantMessage,
  createWrappedModels,
  findPendingConfirmationRequest,
  filterMessagesForAI,
  createOnFinishHandler,
  buildTelemetrySettings,
  getConfirmationToolName,
  getRevisionToolInstructions,
  hashImageData,
  writeTextAndSave,
  confirmationDecisionSchema,
  sessionChatRequestSchema,
} from "./utils";
