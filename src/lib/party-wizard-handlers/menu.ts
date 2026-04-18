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
import { wizardSessions, type SerializedUIMessage, type DietaryTag } from "../../../drizzle/schema";
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
  getConfirmationToolName,
  getRevisionToolInstructions,
  getSilentCompletionFallbackMessage,
  hashImageData,
  isSilentModelCompletion,
  saveAssistantMessage,
  writeTextAndSave,
} from "./utils";
import { runWithRetry, tracedGenerateObject } from "../wizard-ai-runner";
import { createNoopAdapter } from "../telemetry-port";

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

  const telemetryPort = ctx.telemetryPort || createNoopAdapter();

  const runnerConfig = {
    telemetry: telemetryPort,
    functionIdPrefix: "wizard.menu",
  };

  // Dynamically import AI dependencies
  const {
    convertToModelMessages,
    createUIMessageStream,
    createUIMessageStreamResponse,
  } = await import("ai");

  const { defaultModel, visionModel, rawDefaultModel, rawVisionModel, strongModel } = await createWrappedModels(env);

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

            telemetryPort.setTraceOutput({
              event: "step-confirmed",
              step: request.step,
              nextStep,
              requestId: request.id,
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
                  telemetryPort.setTraceOutput({
                    event: "step-confirmed",
                    step: request.step,
                    nextStep,
                    requestId: request.id,
                    timelineAutoGenerated: true,
                    timelineTaskCount: timeline.length,
                  });
                } catch (error) {
                  console.error("[menu] Auto-generate timeline failed:", error);
                  telemetryPort.setTraceOutput({
                    event: "step-confirmed",
                    step: request.step,
                    nextStep,
                    requestId: request.id,
                    timelineAutoGenerated: false,
                    timelineGenerationError: error instanceof Error ? error.message : String(error),
                  });
                }
              }
            }

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

        // ========================================
        // WORKFLOW: Direct image-to-recipe extraction
        // ========================================
        if (hasImage) {
          console.log("[menu] Image detected - using direct extraction workflow");

          // Extract and strip client-side pixel fingerprints before any AI processing
          const fingerprintMatch = incomingMessage.textContent.match(
            /\[image-fingerprints:([a-f0-9,]+)\]/
          );
          if (fingerprintMatch) {
            const fpRegex = /\n?\[image-fingerprints:[a-f0-9,]+\]/;
            incomingMessage.textContent = incomingMessage.textContent.replace(fpRegex, "").trim();
            incomingMessage.parts = incomingMessage.parts.map((p) =>
              p.type === "text" && typeof (p as { text?: string }).text === "string"
                ? { ...p, text: ((p as { text: string }).text).replace(fpRegex, "").trim() }
                : p
            );
          }

          const imageParts = incomingMessage.parts.filter(
            (p) => p.type === "file" && typeof (p as any).mediaType === "string" && (p as any).mediaType.startsWith("image/")
          ) as Array<{ type: "file"; mediaType: string; url: string }>;

          if (imageParts.length > 0) {
            let imageHashes: string[];
            if (fingerprintMatch) {
              imageHashes = fingerprintMatch[1].split(",");
              console.log("[menu] Using client-provided pixel fingerprints for dedup");
            } else {
              imageHashes = await Promise.all(
                imageParts.map((img) => hashImageData(img.url))
              );
            }

            const combinedHash = imageHashes.length === 1
              ? imageHashes[0]
              : await hashImageData(imageHashes.join(":"));

            const processedHashes = currentData.menuPlan?.processedImageHashes || [];
            const isDuplicate = processedHashes.includes(combinedHash)
              || imageHashes.every((h) => processedHashes.includes(h));
            if (isDuplicate) {
              console.log("[menu] Image(s) already processed, skipping");
              const responseText = imageParts.length === 1
                ? "This image has already been added to the menu."
                : "These images have already been added to the menu.";
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
              telemetryPort.setTraceOutput({
                event: "menu-image-duplicate",
                imageHashes,
                combinedHash,
                processedImageCount: processedHashes.length,
                message: responseText,
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
                      image: img.url,
                    })),
                    {
                      type: "text" as const,
                      text: imageParts.length === 1
                        ? `Extract the recipe from this image. Parse all ingredients with their amounts, units, and names. Include step-by-step instructions.

If the image shows a handwritten or printed recipe card, transcribe it accurately.
If it shows a dish/food, infer a reasonable recipe for it.
If the recipe name isn't clear, give it an appropriate name based on the dish.`
                        : `Extract the recipe from these ${imageParts.length} images. The images may show different pages of the same recipe. Combine all information into a single complete recipe.

Parse all ingredients with their amounts, units, and names. Include step-by-step instructions.
If the images show handwritten or printed recipe cards, transcribe them accurately.
If the recipe name isn't clear, give it an appropriate name based on the dish.`,
                    },
                  ],
                },
              ];

              // Use tracedGenerateObject for image extraction
              const { object: recipe } = await tracedGenerateObject(
                runnerConfig,
                {
                  generationName: "wizard.menu.image-extraction",
                  modelName: "gemini-2.5-flash",
                  model: rawVisionModel,
                  schema: aiRecipeExtractionSchema,
                  messages: imageExtractionMessages,
                  metadata: {
                    imageCount: imageParts.length,
                    hasImageHash: Boolean(combinedHash),
                  },
                }
              );

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
                  dietaryTags: recipe.dietaryTags as DietaryTag[] | undefined,
                  sourceType: "photo" as const,
                  imageHash: combinedHash,
                },
              ];
              menuPlan.processedImageHashes = [
                ...(menuPlan.processedImageHashes || []),
                combinedHash,
                ...imageHashes.filter((h) => h !== combinedHash),
              ];

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

              const imageWord = imageParts.length === 1 ? "image" : `${imageParts.length} images`;
              const responseText = `I extracted "${recipe.name}" from your ${imageWord} and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.

What else would you like to add, or are you ready to finalize the menu?`;

              writer.write({
                type: "data-recipe-extracted",
                data: {
                  recipe: { ...recipe, sourceType: "photo" as const },
                  message: responseText,
                },
              });

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
              telemetryPort.setTraceOutput({
                event: "menu-image-extracted",
                recipeName: recipe.name,
                ingredientCount: recipe.ingredients.length,
                instructionCount: recipe.instructions.length,
                imageCount: imageParts.length,
                combinedHash,
                imageHashes,
                menuItemCount: menuPlan.existingRecipes.length + menuPlan.newRecipes.length,
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
              telemetryPort.setTraceOutput({
                event: "menu-url-detected-empty",
                message: "URL was detected but empty after sanitization.",
              });
              return;
            }
            console.log("[menu] URL detected - using direct extraction workflow:", url);

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
              telemetryPort.setTraceOutput({
                event: "menu-url-duplicate",
                sourceUrl: url,
                processedUrlCount: processedUrls.length,
                message: responseText,
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

              // Use tracedGenerateObject for URL extraction
              const { object: recipe } = await tracedGenerateObject(
                runnerConfig,
                {
                  generationName: "wizard.menu.url-extraction",
                  modelName: "gemini-2.5-flash",
                  model: rawDefaultModel,
                  schema: aiRecipeExtractionSchema,
                  prompt: urlExtractionPrompt,
                  metadata: {
                    sourceUrl: url,
                    contentLength: content.length,
                  },
                }
              );

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
                  dietaryTags: recipe.dietaryTags as DietaryTag[] | undefined,
                  sourceUrl: url,
                  sourceType: "url" as const,
                },
              ];
              menuPlan.processedUrls = [...(menuPlan.processedUrls || []), url];

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

              const responseText = `I imported "${recipe.name}" from that URL and added it to the menu! ${recipe.ingredients.length} ingredients and ${recipe.instructions.length} steps.

What else would you like to add, or are you ready to finalize the menu?`;

              writer.write({
                type: "data-recipe-extracted",
                data: {
                  recipe: { ...recipe, sourceType: "url" as const },
                  message: responseText,
                },
              });

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
              telemetryPort.setTraceOutput({
                event: "menu-url-extracted",
                sourceUrl: url,
                recipeName: recipe.name,
                ingredientCount: recipe.ingredients.length,
                instructionCount: recipe.instructions.length,
                menuItemCount: menuPlan.existingRecipes.length + menuPlan.newRecipes.length,
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

        const { result: finalAttempt, retryAttempted, retrySucceeded, attempts } = await runWithRetry(
          runnerConfig,
          {
            model: hasImage ? visionModel : defaultModel,
            modelName: hasImage ? "gemini-2.5-flash-vision" : "gemini-2.5-flash",
            systemPrompt,
            messages: modelMessages,
            tools,
            confirmationToolName,
            writer,
            strongModel,
            strongModelName: env.WIZARD_STRONG_MODEL || "gemini-2.5-pro",
            metadata: {
              hasImage,
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
    console.error("[menu] Error:", error);
    throw error;
  }
}
