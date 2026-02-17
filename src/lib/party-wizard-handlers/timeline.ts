/**
 * Timeline Step Handler
 *
 * Handles the final wizard step: building the cooking timeline.
 * - generateTimeline, adjustTimeline, confirmTimeline tools
 * - Confirmation completes the wizard
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
  writeTextAndSave,
} from "./utils";
import {
  createLangfuseGeneration,
  endLangfuseGeneration,
  updateLangfuseTrace,
  updateLangfuseGeneration,
} from "../langfuse";

export async function handleTimelineStep(ctx: HandlerContext): Promise<Response> {
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

  // Dynamically import AI dependencies
  const {
    streamText,
    convertToModelMessages,
    stepCountIs,
    hasToolCall,
    createUIMessageStream,
    createUIMessageStreamResponse,
  } = await import("ai");

  const { defaultModel } = await createWrappedModels(env);

  // Check if this is a revision request
  const isRevisionRequest = confirmationDecision?.decision.type === "revise";
  const revisionFeedback = isRevisionRequest && confirmationDecision?.decision.type === "revise"
    ? confirmationDecision.decision.feedback
    : undefined;

  const confirmationToolName = getConfirmationToolName(step);

  // Build system prompt
  let systemPrompt = getStepSystemPrompt(step, {
    partyInfo: currentData.partyInfo ?? undefined,
    guestList: currentData.guestList || [],
    menuPlan: currentData.menuPlan ?? undefined,
    userRecipes: [],
  });

  // Add revision context if needed
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
        // If user approved a confirmation, process it
        if (confirmationDecision && pendingConfirmationRequest) {
          const decision = confirmationDecision.decision;
          const request = pendingConfirmationRequest;

          if (decision.type === "approve") {
            const nextStep = request.nextStep;

            // Calculate step indices
            const stepIndices = {
              "party-info": 0,
              "guests": 1,
              "menu": 2,
              "timeline": 3,
              "complete": 3,
            } as const;
            const nextStepIndex = stepIndices[nextStep as keyof typeof stepIndices];

            // Fetch current furthestStepIndex
            const currentSession = await db.query.wizardSessions.findFirst({
              where: eq(wizardSessions.id, sessionId),
              columns: { furthestStepIndex: true },
            });
            const currentFurthestIndex = currentSession?.furthestStepIndex ?? 0;
            const newFurthestIndex = Math.max(currentFurthestIndex, nextStepIndex);

            // For timeline step, "complete" doesn't change currentStep
            // Just update furthestStepIndex
            await db
              .update(wizardSessions)
              .set({
                furthestStepIndex: newFurthestIndex,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(wizardSessions.id, sessionId),
                  eq(wizardSessions.userId, user.id)
                )
              );

            // Emit step-confirmed - client handles "complete" transition
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

        const forcedSilentFinishReason = debug?.forceSilentFinishReason;
        if (forcedSilentFinishReason) {
          const isSilentCompletion = isSilentModelCompletion({
            finishReason: forcedSilentFinishReason,
            responseText: "",
            usage: { outputTokens: 0 },
            toolCalls: [],
            toolResults: [],
          });
          const fallbackMessage = getSilentCompletionFallbackMessage(forcedSilentFinishReason);
          await writeTextAndSave(writer, db, sessionId, step, fallbackMessage);
          updateLangfuseTrace(telemetry?.traceClient, {
            output: {
              finishReason: forcedSilentFinishReason,
              text: "",
              toolCallCount: 0,
              toolResultCount: 0,
              isSilentCompletion,
              fallbackMessage,
              forcedSilentCompletion: true,
            },
          });
          return;
        }

        // Get tools
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

        // Build message history
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

        console.log("[timeline] Calling streamText with", Object.keys(tools).length, "tools");
        const runAttempt = async ({
          attempt,
          attemptSystemPrompt,
          generationName,
        }: {
          attempt: number;
          attemptSystemPrompt: string;
          generationName: string;
        }) => {
          const result = streamText({
            model: defaultModel,
            system: attemptSystemPrompt,
            messages: modelMessages,
            tools,
            stopWhen: [stepCountIs(10), hasToolCall(confirmationToolName)],
            experimental_telemetry: buildTelemetrySettings(
              telemetry,
              "wizard.timeline.streamText",
              {
                messageCount: modelMessages.length,
                toolCount: Object.keys(tools).length,
                isRevisionRequest,
                retryAttempt: attempt,
              },
              env
            ),
          });

          const generation = createLangfuseGeneration(env, {
            traceId: telemetry?.traceId,
            name: generationName,
            model: "gemini-2.5-flash",
            input: {
              systemPrompt: attemptSystemPrompt,
              messages: modelMessages,
              toolNames: Object.keys(tools),
              messageCount: modelMessages.length,
              toolCount: Object.keys(tools).length,
              isRevisionRequest,
              retryAttempt: attempt,
            },
            metadata: {
              step,
              sessionId,
              retryAttempt: attempt,
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
            },
            usage,
          });
          endLangfuseGeneration(generation);

          return {
            response,
            responseText,
            finishReason,
            rawFinishReason,
            usage,
            toolCalls,
            toolResults,
            isSilentCompletion: attemptIsSilentCompletion,
          };
        };

        const firstAttempt = await runAttempt({
          attempt: 1,
          attemptSystemPrompt: systemPrompt,
          generationName: "wizard.timeline.streamText",
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
            generationName: "wizard.timeline.streamText.retry",
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
            finishReason: finalAttempt.finishReason,
            rawFinishReason: finalAttempt.rawFinishReason,
            text: finalAttempt.responseText,
            responseMessageCount: finalAttempt.response.messages.length,
            toolCallCount: finalAttempt.toolCalls.length,
            toolResultCount: finalAttempt.toolResults.length,
            isSilentCompletion: finalAttempt.isSilentCompletion,
            fallbackMessage,
            retryAttempted,
            retrySucceeded,
            attempts: [
              {
                attempt: 1,
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
    console.error("[timeline] Error:", error);
    throw error;
  }
}
