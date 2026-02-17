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
  buildTelemetrySettings,
  getConfirmationToolName,
  getRevisionToolInstructions,
  getSilentCompletionFallbackMessage,
  isSilentModelCompletion,
  isStep12DeterministicEnabled,
  writeTextAndSave,
} from "./utils";
import {
  createLangfuseGeneration,
  endLangfuseGeneration,
  updateLangfuseTrace,
  updateLangfuseGeneration,
} from "../langfuse";
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

  const {
    streamText,
    convertToModelMessages,
    stepCountIs,
    hasToolCall,
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

            updateLangfuseTrace(telemetry?.traceClient, {
              output: {
                event: "step-confirmed",
                step: request.step,
                nextStep,
                requestId: request.id,
              },
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
                  updateLangfuseTrace(telemetry?.traceClient, {
                    output: {
                      decisionPath: "deterministic",
                      deterministicHandled: true,
                      deterministicIntent,
                      deterministicActionError: result.error,
                      modelTierUsed: "none",
                    },
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
                  updateLangfuseTrace(telemetry?.traceClient, {
                    output: {
                      decisionPath: "deterministic",
                      deterministicHandled: true,
                      deterministicIntent,
                      deterministicActionError: result.error,
                      modelTierUsed: "none",
                    },
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

            updateLangfuseTrace(telemetry?.traceClient, {
              output: {
                decisionPath: "deterministic",
                deterministicHandled: true,
                deterministicIntent,
                deterministicActionCount: deterministic.actions.length,
                modelTierUsed: "none",
              },
            });
            return;
          }

          deterministicReason = deterministic.reason;
        }

        const forcedSilentFinishReason = debug?.forceSilentFinishReason;

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
        const runAttempt = async ({
          attempt,
          attemptSystemPrompt,
          generationName,
          model,
          modelName,
          modelTier,
        }: {
          attempt: number;
          attemptSystemPrompt: string;
          generationName: string;
          model: unknown;
          modelName: string;
          modelTier: "default" | "strong";
        }) => {
          if (forcedSilentFinishReason) {
            const responseText = "";
            const finishReason = forcedSilentFinishReason;
            const rawFinishReason = forcedSilentFinishReason;
            const usage = { outputTokens: 0 };
            const toolCalls: unknown[] = [];
            const toolResults: unknown[] = [];

            return {
              responseText,
              finishReason,
              rawFinishReason,
              usage,
              toolCalls,
              toolResults,
              isSilentCompletion: isSilentModelCompletion({
                finishReason,
                responseText,
                usage,
                toolCalls,
                toolResults,
              }),
              responseMessageCount: 0,
              modelTier,
              forcedSilentCompletion: true,
            };
          }

          const result = streamText({
            model: model as never,
            system: attemptSystemPrompt,
            messages: modelMessages,
            tools,
            stopWhen: [stepCountIs(10), hasToolCall(confirmationToolName)],
            experimental_telemetry: buildTelemetrySettings(
              telemetry,
              "wizard.guests.streamText",
              {
                messageCount: modelMessages.length,
                toolCount: Object.keys(tools).length,
                isRevisionRequest,
                retryAttempt: attempt,
                modelTier,
              },
              env
            ),
          });

          const generation = createLangfuseGeneration(env, {
            traceId: telemetry?.traceId,
            name: generationName,
            model: modelName,
            input: {
              systemPrompt: attemptSystemPrompt,
              messages: modelMessages,
              toolNames: Object.keys(tools),
              messageCount: modelMessages.length,
              toolCount: Object.keys(tools).length,
              isRevisionRequest,
              retryAttempt: attempt,
              modelTier,
            },
            metadata: {
              step,
              sessionId,
              retryAttempt: attempt,
              modelTier,
            },
          });

          writer.merge(result.toUIMessageStream());
          const [response, responseText, finishReason, rawFinishReason, usage, toolCalls, toolResults] = await Promise.all([
            result.response,
            result.text,
            result.finishReason,
            result.rawFinishReason,
            result.usage,
            result.toolCalls,
            result.toolResults,
          ]);
          const attemptIsSilentCompletion = isSilentModelCompletion({
            finishReason,
            responseText,
            usage,
            toolCalls,
            toolResults,
          });
          updateLangfuseGeneration(generation, {
            output: {
              finishReason,
              rawFinishReason,
              text: responseText,
              responseMessages: response.messages,
              toolCallCount: toolCalls.length,
              toolResultCount: toolResults.length,
              isSilentCompletion: attemptIsSilentCompletion,
              modelTier,
            },
            usage,
          });
          endLangfuseGeneration(generation);

          return {
            responseText,
            finishReason,
            rawFinishReason,
            usage,
            toolCalls,
            toolResults,
            isSilentCompletion: attemptIsSilentCompletion,
            responseMessageCount: response.messages.length,
            modelTier,
            forcedSilentCompletion: false,
          };
        };

        const firstAttempt = await runAttempt({
          attempt: 1,
          attemptSystemPrompt: systemPrompt,
          generationName: "wizard.guests.streamText",
          model: defaultModel,
          modelName: "gemini-2.5-flash",
          modelTier: "default",
        });

        let finalAttempt = firstAttempt;
        let retryAttempted = false;
        if (firstAttempt.isSilentCompletion) {
          retryAttempted = true;
          finalAttempt = await runAttempt({
            attempt: 2,
            attemptSystemPrompt: `${systemPrompt}

<retry-instruction>
Your previous attempt returned no visible response. Provide a concise user-visible reply, and call tools if needed.
</retry-instruction>`,
            generationName: "wizard.guests.streamText.retry",
            model: strongModel,
            modelName: env.WIZARD_STRONG_MODEL || "gemini-2.5-pro",
            modelTier: "strong",
          });
        }

        const retrySucceeded = retryAttempted && !finalAttempt.isSilentCompletion;
        const fallbackMessage = finalAttempt.isSilentCompletion
          ? getSilentCompletionFallbackMessage(finalAttempt.finishReason)
          : undefined;
        if (fallbackMessage) {
          await writeTextAndSave(writer, db, sessionId, step, fallbackMessage);
        }

        updateLangfuseTrace(telemetry?.traceClient, {
          output: {
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
            forcedSilentCompletion: finalAttempt.forcedSilentCompletion,
            attempts: [
              {
                attempt: 1,
                modelTier: firstAttempt.modelTier,
                finishReason: firstAttempt.finishReason,
                rawFinishReason: firstAttempt.rawFinishReason,
                isSilentCompletion: firstAttempt.isSilentCompletion,
                toolCallCount: firstAttempt.toolCalls.length,
                toolResultCount: firstAttempt.toolResults.length,
                hasText: firstAttempt.responseText.trim().length > 0,
              },
              ...(retryAttempted
                ? [{
                    attempt: 2,
                    modelTier: finalAttempt.modelTier,
                    finishReason: finalAttempt.finishReason,
                    rawFinishReason: finalAttempt.rawFinishReason,
                    isSilentCompletion: finalAttempt.isSilentCompletion,
                    toolCallCount: finalAttempt.toolCalls.length,
                    toolResultCount: finalAttempt.toolResults.length,
                    hasText: finalAttempt.responseText.trim().length > 0,
                  }]
                : []),
            ],
          },
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
