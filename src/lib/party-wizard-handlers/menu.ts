/**
 * Menu Step Handler
 *
 * Handles the third wizard step: building the menu.
 * Most complex handler with three workflows:
 * 1. Image workflow: hash → check duplicates → vision extraction
 * 2. URL workflow: check duplicates → Tavily fetch → AI extraction
 * 3. AI fallback: standard streamText with menu tools
 */

import { eq, and } from "drizzle-orm";
import { wizardSessions, type SerializedUIMessage } from "../../../drizzle/schema";
import { serializeMenuPlan } from "../wizard-session-serialization";
import { getWizardTools } from "../party-wizard-tools";
import { getStepSystemPrompt } from "../party-wizard-prompts";
import { aiRecipeExtractionSchema } from "../schemas";
import type { MenuPlanData } from "../wizard-schemas";
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
  hashImageData,
  isSilentModelCompletion,
  saveAssistantMessage,
  writeTextAndSave,
} from "./utils";
import {
  createLangfuseGeneration,
  endLangfuseGeneration,
  updateLangfuseTrace,
  updateLangfuseGeneration,
} from "../langfuse";

export async function handleMenuStep(ctx: HandlerContext): Promise<Response> {
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
    userRecipes = [],
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
    generateObject,
  } = await import("ai");

  const { defaultModel, visionModel, rawDefaultModel, rawVisionModel } = await createWrappedModels(env);

  // Check if this is a revision request
  const isRevisionRequest = confirmationDecision?.decision.type === "revise";
  const revisionFeedback = isRevisionRequest && confirmationDecision?.decision.type === "revise"
    ? confirmationDecision.decision.feedback
    : undefined;

  const confirmationToolName = getConfirmationToolName(step);
  const hasImage = incomingMessage.hasImage;

  // Build system prompt
  let systemPrompt = getStepSystemPrompt(step, {
    partyInfo: currentData.partyInfo ?? undefined,
    guestList: currentData.guestList || [],
    menuPlan: currentData.menuPlan ?? undefined,
    userRecipes,
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

            // Update session
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

            // Emit step-confirmed
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

            // ========================================
            // WORKFLOW: Auto-generate timeline when entering timeline step
            // ========================================
            if (nextStep === "timeline") {
              const partyInfo = currentData.partyInfo;

              if (partyInfo) {
                try {
                  const { generateTimelineForParty } = await import("../party-wizard-tools");
                  const { serializeTimeline } = await import("../wizard-session-serialization");

                  // Emit intro message
                  const introMessage = "Gathering all the party details to create your cooking timeline...";
                  const textId = crypto.randomUUID();
                  writer.write({ type: "text-start", id: textId });
                  writer.write({ type: "text-delta", id: textId, delta: introMessage });

                  // Generate timeline
                  const timeline = await generateTimelineForParty(
                    partyInfo,
                    currentData.menuPlan,
                    env,
                    {
                      traceId: telemetry?.traceId,
                      sessionId,
                      userId: user.id,
                      step: "timeline",
                      environment: telemetry?.environment,
                    }
                  );

                  // Persist to session
                  await db
                    .update(wizardSessions)
                    .set({
                      timeline: serializeTimeline(timeline),
                      updatedAt: new Date(),
                    })
                    .where(
                      and(
                        eq(wizardSessions.id, sessionId),
                        eq(wizardSessions.userId, user.id)
                      )
                    );

                  // Build response
                  const responseMessage = `\n\nI've created ${timeline.length} tasks for your cooking timeline. Review the schedule below and let me know if you'd like any adjustments!`;

                  // Emit timeline data part
                  writer.write({
                    type: "data-timeline-generated",
                    data: { timeline, message: responseMessage },
                  });

                  // Complete text stream
                  writer.write({ type: "text-delta", id: textId, delta: responseMessage });
                  writer.write({ type: "text-end", id: textId });

                  // Save message to DB
                  const assistantMessage: SerializedUIMessage = {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    content: introMessage + responseMessage,
                    parts: [
                      { type: "text", text: introMessage + responseMessage },
                      { type: "data-timeline-generated", data: { timeline, message: responseMessage } },
                    ],
                    createdAt: new Date().toISOString(),
                  };

                  await saveAssistantMessage(db, sessionId, "timeline", assistantMessage);
                  console.log("[menu] Auto-generated timeline with", timeline.length, "tasks");
                  updateLangfuseTrace(telemetry?.traceClient, {
                    output: {
                      event: "step-confirmed",
                      step: request.step,
                      nextStep,
                      requestId: request.id,
                      timelineAutoGenerated: true,
                      timelineTaskCount: timeline.length,
                    },
                  });
                } catch (error) {
                  console.error("[menu] Auto-generate timeline failed:", error);
                  updateLangfuseTrace(telemetry?.traceClient, {
                    output: {
                      event: "step-confirmed",
                      step: request.step,
                      nextStep,
                      requestId: request.id,
                      timelineAutoGenerated: false,
                      timelineGenerationError: error instanceof Error ? error.message : String(error),
                    },
                  });
                }
              }
            }

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

        // ========================================
        // WORKFLOW: Direct image-to-recipe extraction
        // ========================================
        if (hasImage) {
          console.log("[menu] Image detected - using direct extraction workflow");

          const imageParts = incomingMessage.parts.filter(
            (p) => p.type === "image"
          ) as Array<{ type: "image"; image: string }>;

          if (imageParts.length > 0) {
            // Compute hash
            const imageData = imageParts[0].image as string;
            const imageHash = await hashImageData(imageData);

            // Check duplicates
            const processedHashes = currentData.menuPlan?.processedImageHashes || [];
            if (processedHashes.includes(imageHash)) {
              console.log("[menu] Image already processed, skipping");

              const responseText = "This image has already been added to the menu.";
              const textId = crypto.randomUUID();
              writer.write({ type: "text-start", id: textId });
              writer.write({ type: "text-delta", id: textId, delta: responseText });
              writer.write({ type: "text-end", id: textId });

              const assistantMessage: SerializedUIMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: responseText,
                parts: [{ type: "text", text: responseText }],
                createdAt: new Date().toISOString(),
              };

              await saveAssistantMessage(db, sessionId, step, assistantMessage);
              updateLangfuseTrace(telemetry?.traceClient, {
                output: {
                  event: "menu-image-duplicate",
                  imageHash,
                  processedImageCount: processedHashes.length,
                  message: responseText,
                },
              });
              return;
            }

            try {
              const imageExtractionMessages = [
                {
                  role: "user" as const,
                  content: [
                    ...imageParts.map((img) => ({
                      type: "image" as const,
                      image: img.image as string,
                    })),
                    {
                      type: "text" as const,
                      text: `Extract the recipe from this image. Parse all ingredients with their amounts, units, and names. Include step-by-step instructions.

If the image shows a handwritten or printed recipe card, transcribe it accurately.
If it shows a dish/food, infer a reasonable recipe for it.
If the recipe name isn't clear, give it an appropriate name based on the dish.`,
                    },
                  ],
                },
              ];

              const imageExtractionGeneration = createLangfuseGeneration(env, {
                traceId: telemetry?.traceId,
                name: "wizard.menu.image-extraction",
                model: "gemini-2.5-flash",
                input: {
                  messages: imageExtractionMessages,
                  imageCount: imageParts.length,
                  hasImageHash: Boolean(imageHash),
                },
                metadata: {
                  step,
                  sessionId,
                },
              });

              // Extract recipe using vision model
              const { object: recipe } = await generateObject({
                model: rawVisionModel,
                schema: aiRecipeExtractionSchema,
                messages: imageExtractionMessages,
                experimental_telemetry: buildTelemetrySettings(
                  telemetry,
                  "wizard.menu.imageExtraction.generateObject",
                  {
                    imageCount: imageParts.length,
                  },
                  env
                ),
              });

              updateLangfuseGeneration(imageExtractionGeneration, {
                output: {
                  recipe,
                  recipeName: recipe.name,
                  ingredientCount: recipe.ingredients?.length ?? 0,
                  instructionCount: recipe.instructions?.length ?? 0,
                },
              });
              endLangfuseGeneration(imageExtractionGeneration);

              console.log("[menu] Recipe extracted from image:", recipe.name);

              // Add to menu plan
              const menuPlan: MenuPlanData = currentData.menuPlan
                ? {
                    ...currentData.menuPlan,
                    existingRecipes: [...(currentData.menuPlan.existingRecipes || [])],
                    newRecipes: [...(currentData.menuPlan.newRecipes || [])],
                  }
                : { existingRecipes: [], newRecipes: [] };

              menuPlan.newRecipes = [
                ...menuPlan.newRecipes,
                {
                  ...recipe,
                  sourceType: "photo" as const,
                  imageHash,
                },
              ];
              menuPlan.processedImageHashes = [...(menuPlan.processedImageHashes || []), imageHash];

              // Update currentData and persist
              currentData.menuPlan = menuPlan;
              await db
                .update(wizardSessions)
                .set({
                  menuPlan: serializeMenuPlan(menuPlan),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(wizardSessions.id, sessionId),
                    eq(wizardSessions.userId, user.id)
                  )
                );

              // Build response
              const responseText = `I extracted "${recipe.name}" from your image and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.

What else would you like to add, or are you ready to finalize the menu?`;

              // Emit data part
              writer.write({
                type: "data-recipe-extracted",
                data: {
                  recipe: { ...recipe, sourceType: "photo" as const },
                  message: responseText,
                },
              });

              // Save to DB
              const assistantMessage: SerializedUIMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: responseText,
                parts: [
                  { type: "text", text: responseText },
                  {
                    type: "data-recipe-extracted",
                    data: {
                      recipe: {
                        name: recipe.name,
                        description: recipe.description,
                        ingredients: recipe.ingredients,
                        instructions: recipe.instructions,
                        prepTimeMinutes: recipe.prepTimeMinutes,
                        cookTimeMinutes: recipe.cookTimeMinutes,
                        servings: recipe.servings,
                        tags: recipe.tags,
                        sourceType: "photo",
                      },
                      message: responseText,
                    },
                  },
                ],
                createdAt: new Date().toISOString(),
              };

              await saveAssistantMessage(db, sessionId, step, assistantMessage);
              updateLangfuseTrace(telemetry?.traceClient, {
                output: {
                  event: "menu-image-extracted",
                  recipeName: recipe.name,
                  ingredientCount: recipe.ingredients.length,
                  instructionCount: recipe.instructions.length,
                  imageHash,
                  menuItemCount: menuPlan.existingRecipes.length + menuPlan.newRecipes.length,
                },
              });
              return;
            } catch (error) {
              console.error("[menu] Image extraction failed:", error);
              // Fall through to normal LLM flow
            }
          }
        }

        // ========================================
        // WORKFLOW: Direct URL-to-recipe extraction
        // ========================================
        if (!hasImage) {
          const urlRegex = /https?:\/\/[^\s<>"{}|\\^`]+/gi;
          const urls = incomingMessage.textContent.match(urlRegex);

          if (urls && urls.length > 0) {
            const url = urls[0].replace(/[)\]}>.,!?;]+$/g, "");
            if (!url) {
              updateLangfuseTrace(telemetry?.traceClient, {
                output: {
                  event: "menu-url-detected-empty",
                  message: "URL was detected but empty after sanitization.",
                },
              });
              return;
            }
            console.log("[menu] URL detected - using direct extraction workflow:", url);

            // Check duplicates
            const processedUrls = currentData.menuPlan?.processedUrls || [];
            if (processedUrls.includes(url)) {
              console.log("[menu] URL already processed, skipping:", url);

              const responseText = "This recipe URL has already been added to the menu.";
              const textId = crypto.randomUUID();
              writer.write({ type: "text-start", id: textId });
              writer.write({ type: "text-delta", id: textId, delta: responseText });
              writer.write({ type: "text-end", id: textId });

              const assistantMessage: SerializedUIMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: responseText,
                parts: [{ type: "text", text: responseText }],
                createdAt: new Date().toISOString(),
              };

              await saveAssistantMessage(db, sessionId, step, assistantMessage);
              updateLangfuseTrace(telemetry?.traceClient, {
                output: {
                  event: "menu-url-duplicate",
                  sourceUrl: url,
                  processedUrlCount: processedUrls.length,
                  message: responseText,
                },
              });
              return;
            }

            try {
              // Fetch via Tavily
              const tavilyRes = await fetch("https://api.tavily.com/extract", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${env.TAVILY_API_KEY}`,
                },
                body: JSON.stringify({ urls: [url] }),
              });

              if (!tavilyRes.ok) {
                throw new Error("Failed to fetch URL content");
              }

              const tavilyData = (await tavilyRes.json()) as {
                results: Array<{ raw_content?: string; content?: string }>;
              };
              const content = tavilyData.results[0]?.raw_content || tavilyData.results[0]?.content;

              if (!content) {
                throw new Error("Could not extract content from URL");
              }

              const urlExtractionPrompt = `Extract the recipe from this webpage. Parse ingredients with amount/unit/name separated.\n\n${content}`;

              const urlExtractionGeneration = createLangfuseGeneration(env, {
                traceId: telemetry?.traceId,
                name: "wizard.menu.url-extraction",
                model: "gemini-2.5-flash",
                input: {
                  sourceUrl: url,
                  contentLength: content.length,
                  prompt: urlExtractionPrompt,
                },
                metadata: {
                  step,
                  sessionId,
                },
              });

              // Extract with AI
              const { object: recipe } = await generateObject({
                model: rawDefaultModel,
                schema: aiRecipeExtractionSchema,
                prompt: urlExtractionPrompt,
                experimental_telemetry: buildTelemetrySettings(
                  telemetry,
                  "wizard.menu.urlExtraction.generateObject",
                  {
                    sourceUrl: url,
                    contentLength: content.length,
                  },
                  env
                ),
              });

              updateLangfuseGeneration(urlExtractionGeneration, {
                output: {
                  recipe,
                  recipeName: recipe.name,
                  ingredientCount: recipe.ingredients?.length ?? 0,
                  instructionCount: recipe.instructions?.length ?? 0,
                },
              });
              endLangfuseGeneration(urlExtractionGeneration);

              console.log("[menu] Recipe extracted from URL:", recipe.name);

              // Add to menu plan
              const menuPlan: MenuPlanData = currentData.menuPlan
                ? {
                    ...currentData.menuPlan,
                    existingRecipes: [...(currentData.menuPlan.existingRecipes || [])],
                    newRecipes: [...(currentData.menuPlan.newRecipes || [])],
                  }
                : { existingRecipes: [], newRecipes: [] };

              menuPlan.newRecipes = [
                ...menuPlan.newRecipes,
                {
                  ...recipe,
                  sourceUrl: url,
                  sourceType: "url" as const,
                },
              ];
              menuPlan.processedUrls = [...(menuPlan.processedUrls || []), url];

              // Update currentData and persist
              currentData.menuPlan = menuPlan;
              await db
                .update(wizardSessions)
                .set({
                  menuPlan: serializeMenuPlan(menuPlan),
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(wizardSessions.id, sessionId),
                    eq(wizardSessions.userId, user.id)
                  )
                );

              // Build response
              const responseText = `I imported "${recipe.name}" from that URL and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.

What else would you like to add, or are you ready to finalize the menu?`;

              // Emit data part
              writer.write({
                type: "data-recipe-extracted",
                data: {
                  recipe: { ...recipe, sourceType: "url" as const },
                  message: responseText,
                },
              });

              // Save to DB
              const assistantMessage: SerializedUIMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: responseText,
                parts: [
                  { type: "text", text: responseText },
                  {
                    type: "data-recipe-extracted",
                    data: {
                      recipe: {
                        name: recipe.name,
                        description: recipe.description,
                        ingredients: recipe.ingredients,
                        instructions: recipe.instructions,
                        prepTimeMinutes: recipe.prepTimeMinutes,
                        cookTimeMinutes: recipe.cookTimeMinutes,
                        servings: recipe.servings,
                        tags: recipe.tags,
                        sourceType: "url",
                      },
                      message: responseText,
                    },
                  },
                ],
                createdAt: new Date().toISOString(),
              };

              await saveAssistantMessage(db, sessionId, step, assistantMessage);
              updateLangfuseTrace(telemetry?.traceClient, {
                output: {
                  event: "menu-url-extracted",
                  sourceUrl: url,
                  recipeName: recipe.name,
                  ingredientCount: recipe.ingredients.length,
                  instructionCount: recipe.instructions.length,
                  menuItemCount: menuPlan.existingRecipes.length + menuPlan.newRecipes.length,
                },
              });
              return;
            } catch (error) {
              console.error("[menu] URL extraction failed:", error);
              // Fall through to normal LLM flow
            }
          }
        }

        // ========================================
        // AI Fallback: Standard streamText with menu tools
        // ========================================
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

        console.log("[menu] Calling streamText with", Object.keys(tools).length, "tools");
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
            model: hasImage ? visionModel : defaultModel,
            system: attemptSystemPrompt,
            messages: modelMessages,
            tools,
            stopWhen: [stepCountIs(10), hasToolCall(confirmationToolName)],
            experimental_telemetry: buildTelemetrySettings(
              telemetry,
              "wizard.menu.streamText",
              {
                messageCount: modelMessages.length,
                toolCount: Object.keys(tools).length,
                hasImage,
                isRevisionRequest,
                retryAttempt: attempt,
              },
              env
            ),
          });

          const generation = createLangfuseGeneration(env, {
            traceId: telemetry?.traceId,
            name: generationName,
            model: hasImage ? "gemini-2.5-flash-vision" : "gemini-2.5-flash",
            input: {
              systemPrompt: attemptSystemPrompt,
              messages: modelMessages,
              toolNames: Object.keys(tools),
              messageCount: modelMessages.length,
              toolCount: Object.keys(tools).length,
              hasImage,
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
          generationName: "wizard.menu.streamText",
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
            generationName: "wizard.menu.streamText.retry",
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
    console.error("[menu] Error:", error);
    throw error;
  }
}
