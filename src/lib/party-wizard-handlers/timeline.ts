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
  getConfirmationToolName,
  getRevisionToolInstructions,
  getSilentCompletionFallbackMessage,
  isSilentModelCompletion,
  writeTextAndSave,
} from "./utils";
import { runWithRetry } from "../wizard-ai-runner";
import { createNoopAdapter } from "../telemetry-port";

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

        console.log("[timeline] Calling streamText with", Object.keys(tools).length, "tools");

        const { result, retryAttempted, retrySucceeded, attempts } = await runWithRetry(
          {
            telemetry: telemetryPort,
            functionIdPrefix: "wizard.timeline",
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

        const fallbackMessage = result.isSilentCompletion
          ? getSilentCompletionFallbackMessage(result.finishReason)
          : undefined;
        if (fallbackMessage) {
          await writeTextAndSave(writer, db, sessionId, step, fallbackMessage);
        }

        telemetryPort.setTraceOutput({
          finishReason: result.finishReason,
          rawFinishReason: result.rawFinishReason,
          text: result.responseText,
          responseMessageCount: result.responseMessageCount,
          toolCallCount: result.toolCalls.length,
          toolResultCount: result.toolResults.length,
          isSilentCompletion: result.isSilentCompletion,
          fallbackMessage: fallbackMessage || undefined,
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
    console.error("[timeline] Error:", error);
    throw error;
  }
}
