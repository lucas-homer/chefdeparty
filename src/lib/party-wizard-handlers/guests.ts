/**
 * Guests Step Handler
 *
 * Handles the second wizard step: building the guest list.
 * - Deterministic extraction for common structured turns
 * - Model fallback for ambiguous/unstructured turns
 * - addGuest, removeGuest, confirmGuestList tools
 * - Approval transitions to menu step
 */

import { eq, and } from "drizzle-orm";
import { wizardSessions, type SerializedUIMessage } from "../../../drizzle/schema";
import { getWizardTools } from "../party-wizard-tools";
import { getStepSystemPrompt } from "../party-wizard-prompts";
import type { WizardMessage } from "../wizard-message-types";
import type { HandlerContext } from "./utils";
import {
  createWrappedModels,
  filterMessagesForAI,
  createOnFinishHandler,
  getConfirmationToolName,
  getRevisionToolInstructions,
  getSilentCompletionFallbackMessage,
  isSilentModelCompletion,
  isStep12DeterministicEnabled,
  writeTextAndSave,
} from "./utils";
import { runWithRetry } from "../wizard-ai-runner";
import { createNoopAdapter } from "../telemetry-port";
import { resolveDeterministicGuestsTurn } from "../party-wizard-deterministic/guests";
import {
  addGuestAction,
  confirmGuestListAction,
  removeGuestAction,
} from "../party-wizard-actions/guests";

export async function handleGuestsStep(ctx: HandlerContext): Promise<Response> {
  const {
    db,
    user,
    env,
    sessionId,
    step,
    currentData,
    existingMessages,
    incomingMessage,
    referenceNow,
    confirmationDecision,
    pendingConfirmationRequest,
    telemetry,
    debug,
  } = ctx;

  const telemetryPort = ctx.telemetryPort || createNoopAdapter();

  const {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
  } = await import("ai");

  const { defaultModel, strongModel } = await createWrappedModels(env);

  const isRevisionRequest = confirmationDecision?.decision.type === "revise";
  const revisionFeedback = isRevisionRequest && confirmationDecision?.decision.type === "revise"
    ? confirmationDecision.decision.feedback
    : undefined;

  const confirmationToolName = getConfirmationToolName(step);

  let systemPrompt = getStepSystemPrompt(step, {
    partyInfo: currentData.partyInfo ?? undefined,
    guestList: currentData.guestList || [],
    menuPlan: currentData.menuPlan ?? undefined,
    userRecipes: [],
  });

  if (isRevisionRequest && revisionFeedback && pendingConfirmationRequest) {
    systemPrompt += `

IMPORTANT - REVISION IN PROGRESS:
The user clicked "Make Changes" on the confirmation dialog with this feedback:
"${revisionFeedback}"

YOU MUST CALL TOOLS - do not just respond with text!
${getRevisionToolInstructions(step)}

Previous confirmation summary: "${pendingConfirmationRequest.summary}"`;
  }

  try {
    const stream = createUIMessageStream<WizardMessage>({
      execute: async ({ writer }) => {
        if (confirmationDecision && pendingConfirmationRequest) {
          const decision = confirmationDecision.decision;
          const request = pendingConfirmationRequest;

          if (decision.type === "approve") {
            const nextStep = request.nextStep;

            const stepIndices = {
              "party-info": 0,
              "guests": 1,
              "menu": 2,
              "timeline": 3,
              "complete": 3,
            } as const;
            const nextStepIndex = stepIndices[nextStep as keyof typeof stepIndices];

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
            }

            writer.write({
              type: "data-step-confirmed",
              data: {
                requestId: request.id,
                step: request.step,
                nextStep: nextStep,
              },
            });

            telemetryPort.setTraceOutput({
              event: "step-confirmed",
              step: request.step,
              nextStep,
              requestId: request.id,
            });

            return;
          }
        }

        const deterministicEnabled = isStep12DeterministicEnabled(env);
        let deterministicHandled = false;
        let deterministicIntent: string | undefined;
        let deterministicReason: string | undefined;

        if (deterministicEnabled) {
          const deterministicText = isRevisionRequest && revisionFeedback
            ? revisionFeedback
            : incomingMessage.textContent;
          const deterministic = resolveDeterministicGuestsTurn({
            text: deterministicText,
            currentData,
          });

          if (deterministic.handled) {
            deterministicHandled = true;
            deterministicIntent = deterministic.intent;

            const additionalParts: Array<Record<string, unknown>> = [];
            let guestListUpdated = false;
            for (const action of deterministic.actions) {
              if (action.type === "add-guest") {
                const result = await addGuestAction(
                  { db, userId: user.id, sessionId, currentData },
                  action.payload
                );
                if (!result.success) {
                  await writeTextAndSave(writer, db, sessionId, step, result.message);
                  telemetryPort.setTraceOutput({
                    decisionPath: "deterministic",
                    deterministicHandled: true,
                    deterministicIntent,
                    deterministicActionError: result.error,
                    modelTierUsed: "none",
                  });
                  return;
                }

                if (result.action === "updateGuestList") {
                  guestListUpdated = true;
                }
                continue;
              }

              if (action.type === "remove-guest") {
                const result = await removeGuestAction(
                  { db, userId: user.id, sessionId, currentData },
                  action.payload
                );
                if (!result.success) {
                  await writeTextAndSave(writer, db, sessionId, step, result.error);
                  telemetryPort.setTraceOutput({
                    decisionPath: "deterministic",
                    deterministicHandled: true,
                    deterministicIntent,
                    deterministicActionError: result.error,
                    modelTierUsed: "none",
                  });
                  return;
                }

                if (result.action === "updateGuestList") {
                  guestListUpdated = true;
                }
                continue;
              }

              if (action.type === "confirm-guest-list") {
                const result = await confirmGuestListAction({
                  db,
                  userId: user.id,
                  sessionId,
                  currentData,
                });
                additionalParts.push({
                  type: "data-step-confirmation-request",
                  data: { request: result.request },
                });
              }
            }

            if (guestListUpdated) {
              additionalParts.push({
                type: "data-session-refresh",
                data: { action: "updateGuestList" },
              });
            }

            await writeTextAndSave(
              writer,
              db,
              sessionId,
              step,
              deterministic.assistantText,
              additionalParts
            );

            telemetryPort.setTraceOutput({
              decisionPath: "deterministic",
              deterministicHandled: true,
              deterministicIntent,
              deterministicActionCount: deterministic.actions.length,
              modelTierUsed: "none",
            });
            return;
          }

          deterministicReason = deterministic.reason;
        }

        const forcedSilentFinishReason = debug?.forceSilentFinishReason;
        if (forcedSilentFinishReason) {
          const silent = isSilentModelCompletion({
            finishReason: forcedSilentFinishReason,
            responseText: "",
            usage: { outputTokens: 0 },
            toolCalls: [],
            toolResults: [],
          });
          const fallbackMessage = getSilentCompletionFallbackMessage(forcedSilentFinishReason);
          await writeTextAndSave(writer, db, sessionId, step, fallbackMessage);
          telemetryPort.setTraceOutput({
            finishReason: forcedSilentFinishReason,
            text: "",
            toolCallCount: 0,
            toolResultCount: 0,
            isSilentCompletion: silent,
            fallbackMessage,
            forcedSilentCompletion: true,
          });
          return;
        }

        const tools = getWizardTools(step, {
          db,
          userId: user.id,
          env,
          currentData,
          referenceNow,
          sessionId,
          writer,
          telemetry,
        });

        const userMessageForAI: SerializedUIMessage = {
          id: incomingMessage.id,
          role: "user",
          content: incomingMessage.textContent,
          parts: incomingMessage.parts,
          createdAt: new Date().toISOString(),
        };

        const allMessages = [
          ...existingMessages,
          userMessageForAI,
        ];

        let messagesToConvert = confirmationDecision?.decision.type === "approve" && pendingConfirmationRequest
          ? []
          : allMessages;

        messagesToConvert = filterMessagesForAI(messagesToConvert);
        const modelMessages = await convertToModelMessages(messagesToConvert as WizardMessage[]);

        console.log("[guests] Calling streamText with", Object.keys(tools).length, "tools");

        const { result: finalAttempt, retryAttempted, retrySucceeded, attempts } = await runWithRetry(
          {
            telemetry: telemetryPort,
            functionIdPrefix: "wizard.guests",
          },
          {
            model: defaultModel,
            modelName: "gemini-2.5-flash",
            systemPrompt,
            messages: modelMessages,
            tools,
            confirmationToolName,
            writer,
            strongModel,
            strongModelName: env.WIZARD_STRONG_MODEL || "gemini-2.5-pro",
            metadata: {
              isRevisionRequest,
            },
          }
        );

        const fallbackMessage = finalAttempt.isSilentCompletion
          ? getSilentCompletionFallbackMessage(finalAttempt.finishReason)
          : undefined;
        if (fallbackMessage) {
          await writeTextAndSave(writer, db, sessionId, step, fallbackMessage);
        }

        telemetryPort.setTraceOutput({
          decisionPath: "model",
          deterministicHandled,
          deterministicIntent,
          deterministicReason,
          modelTierUsed: retryAttempted ? "strong" : "default",
          finishReason: finalAttempt.finishReason,
          rawFinishReason: finalAttempt.rawFinishReason,
          text: finalAttempt.responseText,
          responseMessageCount: finalAttempt.responseMessageCount,
          toolCallCount: finalAttempt.toolCalls.length,
          toolResultCount: finalAttempt.toolResults.length,
          isSilentCompletion: finalAttempt.isSilentCompletion,
          fallbackMessage,
          retryAttempted,
          retrySucceeded,
          attempts: attempts.map((a, i) => ({
            attempt: i + 1,
            modelTier: a.modelTier,
            finishReason: a.finishReason,
            rawFinishReason: a.rawFinishReason,
            isSilentCompletion: a.isSilentCompletion,
            toolCallCount: a.toolCalls.length,
            toolResultCount: a.toolResults.length,
            hasText: a.responseText.trim().length > 0,
          })),
        });
      },
      generateId: () => crypto.randomUUID(),
      onFinish: createOnFinishHandler(db, sessionId, step, env, telemetry),
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error("[guests] Error:", error);
    throw error;
  }
}
