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
} from "./utils";
import {
  createLangfuseGeneration,
  endLangfuseGeneration,
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

            return;
          }
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

        const result = streamText({
          model: defaultModel,
          system: systemPrompt,
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
            },
            env
          ),
        });

        const generation = createLangfuseGeneration(env, {
          traceId: telemetry?.traceId,
          name: "wizard.timeline.streamText",
          model: "gemini-2.5-flash",
          input: {
            systemPrompt,
            messages: modelMessages,
            toolNames: Object.keys(tools),
            messageCount: modelMessages.length,
            toolCount: Object.keys(tools).length,
            isRevisionRequest,
          },
          metadata: {
            step,
            sessionId,
          },
        });

        writer.merge(result.toUIMessageStream());
        const [response, responseText, finishReason, usage] = await Promise.all([
          result.response,
          result.text,
          result.finishReason,
          result.usage,
        ]);
        updateLangfuseGeneration(generation, {
          output: {
            finishReason,
            text: responseText,
            responseMessages: response.messages,
          },
          usage,
        });
        endLangfuseGeneration(generation);
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
