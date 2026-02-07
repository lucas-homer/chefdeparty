import React, { useRef, useEffect, useState, useMemo, FormEvent, useCallback, startTransition } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { WizardProgress } from "./WizardProgress";
import { WizardCreating } from "./WizardCreating";
import { RecipePicker } from "./RecipePicker";
import { MenuSidebar } from "./MenuSidebar";
import { TimelinePreview } from "./TimelinePreview";
import { useWizardState } from "./useWizardState";
import type {
  WizardStep,
  UserRecipe,
  TimelineTaskData,
} from "./types";
import { WIZARD_STEPS } from "./types";

// Types for HITL step confirmation flow
interface StepConfirmationRequest {
  id: string;
  step: WizardStep;
  nextStep: WizardStep | "complete";
  summary: string;
  data: Record<string, unknown>;
}

// Decision type for step confirmation (approve or revise with feedback)
type StepConfirmationDecision =
  | { type: "approve" }
  | { type: "revise"; feedback: string };

interface PartyWizardChatProps {
  onComplete?: (partyUrl: string) => void;
  onCancel?: () => void;
}

export function PartyWizardChat({ onComplete, onCancel }: PartyWizardChatProps) {
  const {
    session,
    messages: initialMessages,
    isLoading: sessionLoading,
    error: sessionError,
    setStep,
    startNewSession,
    refreshSession,
  } = useWizardState();

  // Show loading state until session is available
  if (sessionLoading || !session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">{sessionError}</div>
      </div>
    );
  }

  // Render the actual chat component only when session is available
  return (
    <PartyWizardChatInner
      session={session}
      initialMessages={initialMessages}
      setStep={setStep}
      startNewSession={startNewSession}
      refreshSession={refreshSession}
      onComplete={onComplete}
      onCancel={onCancel}
    />
  );
}

// Inner component that renders only when session is available
// This ensures useChat is initialized with a valid sessionId
interface PartyWizardChatInnerProps {
  session: NonNullable<ReturnType<typeof useWizardState>["session"]>;
  initialMessages: UIMessage[];
  setStep: (step: WizardStep) => void;
  startNewSession: () => void;
  refreshSession: () => void;
  onComplete?: (partyUrl: string) => void;
  onCancel?: () => void;
}

function PartyWizardChatInner({
  session,
  initialMessages,
  setStep,
  startNewSession,
  refreshSession,
  onComplete,
  onCancel,
}: PartyWizardChatInnerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [input, setInput] = useState("");
  const [isGivingFeedback, setIsGivingFeedback] = useState(false);
  const [feedbackRequestId, setFeedbackRequestId] = useState<string | null>(null);
  // Track request IDs that have been decided (approved or revision requested)
  // This persists so old confirmation UIs stay hidden
  const [locallyDecidedIds, setLocallyDecidedIds] = useState<Set<string>>(new Set());
  // Curated timeline from TimelinePreview - used when completing wizard
  const [curatedTimeline, setCuratedTimeline] = useState<TimelineTaskData[] | null>(null);

  // Get current step from session
  const currentStep = session.currentStep as WizardStep;

  // Generate a stable chat ID based on session ID and step
  const chatId = `${session.id}-${currentStep}`;

  // Ref to pass confirmation decision to transport (cohort-002-project pattern)
  // The decision is passed as a separate body param so server can process it before AI call
  const confirmationDecisionRef = useRef<{
    requestId: string;
    decision: StepConfirmationDecision;
  } | null>(null);

  // Create transport using AI SDK v6 canonical pattern
  // Sends only the latest message - server reconstructs history from DB
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/parties/wizard/chat",
        prepareSendMessagesRequest: ({ messages: msgs, id }) => {
          // Only send the latest message - server has the history
          const latestMessage = msgs[msgs.length - 1];
          // Get and clear the decision ref
          const currentDecision = confirmationDecisionRef.current;
          confirmationDecisionRef.current = null;
          return {
            body: {
              sessionId: session.id,
              message: latestMessage,
              // Pass decision as separate body param (cohort-002-project pattern)
              confirmationDecision: currentDecision || undefined,
            },
          };
        },
      }),
    [session.id]
  );

  // Initialize chat with session-based transport
  const { messages, status, sendMessage, error: chatError, setMessages } =
    useChat({
      id: chatId,
      initialMessages: initialMessages,
      transport,
      generateId: () => crypto.randomUUID(),
      onFinish: ({ message }) => {
        console.log("[PartyWizardChat] onFinish message:", message);
        processDataParts(message);
        // Clear feedbackRequestId now that we have a response
        setFeedbackRequestId(null);
      },
      onError: (err) => {
        console.error("[PartyWizardChat] useChat error:", err);
        setError(err.message || "Chat error occurred");
      },
    });

  // Track which confirmation requests have been decided
  // Combines locally tracked decisions with any found in messages
  const decidedRequestIds = useMemo(() => {
    // Start with locally decided IDs (from approve/revise button clicks)
    const decided = new Set<string>(locallyDecidedIds);
    // Also check messages for decision/confirmed parts (in case they came from server)
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "data-step-confirmation-decision") {
          const data = (part as { data: { requestId: string } }).data;
          decided.add(data.requestId);
        }
        if (part.type === "data-step-confirmed") {
          const data = (part as { data: { requestId: string } }).data;
          decided.add(data.requestId);
        }
      }
    }
    return decided;
  }, [messages, locallyDecidedIds]);

  // Update messages when initial messages change (step change)
  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages, setMessages, messages.length]);

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-focus input when loading finishes (status becomes "ready")
  useEffect(() => {
    if (status === "ready") {
      inputRef.current?.focus();
    }
  }, [status]);

  // Log chat error state
  useEffect(() => {
    if (chatError) {
      console.error("[PartyWizardChat] Chat error state:", chatError);
      setError(chatError.message || "Chat error occurred");
    }
  }, [chatError]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Process data parts from assistant messages
  function processDataParts(message: UIMessage) {
    let needsRefresh = false;

    for (const part of message.parts) {
      if (part.type === "data-step-confirmed") {
        const data = (part as { data: { nextStep: string } }).data;
        console.log("[PartyWizardChat] Step confirmed, next step:", data.nextStep);

        if (data.nextStep === "complete") {
          // Trigger party creation
          handleWizardComplete();
        } else {
          // Update to next step after a brief delay
          setTimeout(() => {
            setStep(data.nextStep as WizardStep);
            refreshSession();
          }, 500);
        }
      }

      // Refresh session when recipe is extracted so sidebar updates
      if (part.type === "data-recipe-extracted") {
        console.log("[PartyWizardChat] Recipe extracted, will refresh session");
        needsRefresh = true;
      }
    }

    // Refresh session if needed (outside the loop to avoid multiple refreshes)
    if (needsRefresh) {
      refreshSession();
    }
  }

  // Handle approval of step confirmation (cohort-002-project pattern)
  const handleApprove = useCallback((requestId: string) => {
    console.log("[PartyWizardChat] Approving request:", requestId);
    // Mark as decided so confirmation UI stays hidden
    setLocallyDecidedIds(prev => new Set(prev).add(requestId));
    // Set the ref before sending so transport can include it
    confirmationDecisionRef.current = {
      requestId,
      decision: { type: "approve" },
    };
    startTransition(() => {
      sendMessage({
        text: "Confirmed",
      });
    });
  }, [sendMessage]);

  // Handle revision request - enter feedback mode (cohort-002-project pattern)
  const handleRevise = useCallback((requestId: string) => {
    console.log("[PartyWizardChat] Requesting revision for:", requestId);
    // Mark as decided so confirmation UI stays hidden
    setLocallyDecidedIds(prev => new Set(prev).add(requestId));
    setIsGivingFeedback(true);
    setFeedbackRequestId(requestId);
    setInput("");
    // Focus the input
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }, []);

  // Handle submitting revision feedback (cohort-002-project pattern)
  const handleSubmitRevisionFeedback = useCallback((feedback: string) => {
    if (!feedbackRequestId) return;

    console.log("[PartyWizardChat] Submitting revision feedback:", feedback);
    // Set the ref before sending so transport can include it
    confirmationDecisionRef.current = {
      requestId: feedbackRequestId,
      decision: { type: "revise", feedback: feedback || "No feedback provided" },
    };

    startTransition(() => {
      sendMessage({
        text: feedback || "Please make changes",
      });

      setIsGivingFeedback(false);
      // Don't clear feedbackRequestId yet - keep it so decidedRequestIds still includes it
      // It will be cleared in onFinish after we get the response
      setInput("");
    });
  }, [feedbackRequestId, sendMessage]);

  async function handleWizardComplete() {
    if (!session?.partyInfo) {
      setError("Party information is missing");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/parties/wizard/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          partyInfo: {
            ...session.partyInfo,
            dateTime: new Date(session.partyInfo.dateTime),
          },
          guestList: session.guestList || [],
          menuPlan: session.menuPlan || { existingRecipes: [], newRecipes: [] },
          // Use curated timeline if available, otherwise fall back to session timeline
          timeline: curatedTimeline || session.timeline || [],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create party");
      }

      const data = await response.json();

      if (onComplete) {
        onComplete(data.partyUrl);
      } else {
        window.location.href = data.partyUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create party");
      setIsCreating(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    if (isGivingFeedback && feedbackRequestId) {
      // Use the dedicated handler for revision feedback (cohort-002-project pattern)
      handleSubmitRevisionFeedback(input);
    } else {
      sendMessage({ text: input });
      setInput("");
    }
  }

  function handleStepClick(step: WizardStep) {
    setStep(step);
  }

  function handleRecipeSelect(recipe: UserRecipe) {
    // Add message to chat asking AI to add the recipe
    sendMessage({
      text: `Please add my recipe "${recipe.name}" (ID: ${recipe.id}) to the menu.`,
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      sendMessage({
        parts: [
          { type: "image", image: dataUrl },
          { type: "text", text: "Please extract the recipe from this image and add it to the menu." },
        ],
      });
    };
    reader.readAsDataURL(file);

    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  // Handle removing a menu item from the sidebar - calls API directly for instant removal
  async function handleRemoveMenuItem(index: number, isNew: boolean) {
    try {
      const response = await fetch("/api/parties/wizard/menu-item", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          index,
          isNewRecipe: isNew,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove item");
      }

      // Refresh session to update the sidebar
      refreshSession();
    } catch (err) {
      console.error("[PartyWizardChat] Failed to remove menu item:", err);
      setError(err instanceof Error ? err.message : "Failed to remove item");
    }
  }

  // Get selected recipe IDs for the picker
  const selectedRecipeIds = [
    ...(session.menuPlan?.existingRecipes?.map((r) => r.recipeId) || []),
  ];

  // Render a message part
  function renderMessagePart(msg: UIMessage, part: UIMessage["parts"][0], index: number) {
    if (part.type === "text") {
      const text = (part as { text: string }).text;
      // Skip empty or whitespace-only text
      if (!text || !text.trim()) {
        return null;
      }
      return (
        <div key={index} className="whitespace-pre-wrap">
          {text}
        </div>
      );
    }

    // Skip internal step markers
    if (part.type === "step-start") {
      return null;
    }

    if (part.type === "data-step-confirmation-request") {
      const partData = part as { type: string; data: { request: StepConfirmationRequest } };
      const request = partData.data?.request;

      if (!request) {
        return null;
      }

      const hasDecision = decidedRequestIds.has(request.id);

      if (hasDecision) {
        // Show a collapsed version instead of nothing
        return (
          <div key={index} className="text-sm text-muted-foreground italic">
            {request.summary}
          </div>
        );
      }

      // Render detailed content for confirmation steps
      const renderConfirmationContent = () => {
        console.log("[renderConfirmationContent] request.step:", request.step, "request.data:", request.data);

        if (request.step === "guests") {
          const guestList = (request.data as { guestList?: Array<{ name?: string; email?: string; phone?: string }> }).guestList || [];
          if (guestList.length === 0) {
            return <p className="text-sm text-muted-foreground mb-4">No guests added yet (you can add them later)</p>;
          }
          return (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">{guestList.length} guest{guestList.length === 1 ? "" : "s"}:</p>
              <ul className="space-y-1.5 text-sm">
                {guestList.map((guest, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-medium">{guest.name || "Guest"}</span>
                    <span className="text-muted-foreground">
                      {guest.email && guest.phone
                        ? `(${guest.email}, ${guest.phone})`
                        : `(${guest.email || guest.phone})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        if (request.step === "menu") {
          const menuPlan = (request.data as {
            menuPlan?: {
              existingRecipes?: Array<{ name: string; recipeId: string }>;
              newRecipes?: Array<{ name: string; sourceType?: string }>;
            };
          }).menuPlan;

          const existingRecipes = menuPlan?.existingRecipes || [];
          const newRecipes = menuPlan?.newRecipes || [];
          const totalCount = existingRecipes.length + newRecipes.length;

          if (totalCount === 0) {
            return <p className="text-sm text-muted-foreground mb-4">No recipes added yet (you can add them later)</p>;
          }

          return (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">{totalCount} recipe{totalCount === 1 ? "" : "s"} on the menu:</p>
              <ul className="space-y-1.5 text-sm">
                {existingRecipes.map((recipe, i) => (
                  <li key={`existing-${i}`} className="flex items-center gap-2">
                    <span className="font-medium">{recipe.name}</span>
                    <span className="text-muted-foreground text-xs">(from library)</span>
                  </li>
                ))}
                {newRecipes.map((recipe, i) => (
                  <li key={`new-${i}`} className="flex items-center gap-2">
                    <span className="font-medium">{recipe.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {recipe.sourceType === "photo" && "📷"}
                      {recipe.sourceType === "url" && "🔗"}
                      {recipe.sourceType === "ai" && "✨"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        // Default: show summary
        return <p className="text-sm text-muted-foreground mb-4">{request.summary}</p>;
      };

      return (
        <div key={index} className="mt-3 p-4 bg-card border rounded-lg">
          <h3 className="font-medium mb-2">Please confirm {request.step}:</h3>
          {renderConfirmationContent()}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleApprove(request.id)}
              disabled={isLoading}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
            >
              Confirm & Continue
            </button>
            <button
              type="button"
              onClick={() => handleRevise(request.id)}
              disabled={isLoading}
              className="px-4 py-2 border rounded-md hover:bg-muted text-sm"
            >
              Make Changes
            </button>
          </div>
        </div>
      );
    }

    if (part.type === "data-step-confirmation-decision") {
      const data = (part as { data: { decision: { type: string; feedback?: string } } }).data;
      if (data.decision.type === "approve") {
        return (
          <div key={index} className="text-sm text-green-600 dark:text-green-400">
            ✓ Confirmed
          </div>
        );
      } else {
        return (
          <div key={index} className="text-sm text-muted-foreground">
            Requesting changes...
          </div>
        );
      }
    }

    if (part.type === "data-step-confirmed") {
      const data = (part as { data: { nextStep: string } }).data;
      return (
        <div key={index} className="text-sm text-green-600 dark:text-green-400">
          {data.nextStep === "complete"
            ? "✓ All steps complete! Creating your party..."
            : `✓ Moving to ${data.nextStep} step...`}
        </div>
      );
    }

    // Recipe extracted from image - render a recipe card
    if (part.type === "data-recipe-extracted") {
      const data = (part as {
        data: {
          recipe: {
            name: string;
            description?: string;
            ingredients: Array<{ amount?: string; unit?: string; ingredient: string; notes?: string }>;
            instructions: Array<{ step: number; description: string }>;
            prepTimeMinutes?: number;
            cookTimeMinutes?: number;
            servings?: number;
            sourceType: string;
          };
          message: string;
        };
      }).data;

      const recipe = data.recipe;
      const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

      return (
        <div key={index} className="space-y-3">
          {/* Message text */}
          <p className="whitespace-pre-wrap">{data.message}</p>

          {/* Recipe card */}
          <div className="border rounded-lg overflow-hidden bg-card">
            <div className="p-4 border-b bg-muted/30">
              <h3 className="font-semibold text-lg">{recipe.name}</h3>
              {recipe.description && (
                <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>
              )}
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                {recipe.servings && <span>Serves {recipe.servings}</span>}
                {totalTime > 0 && <span>{totalTime} min total</span>}
                {recipe.sourceType === "photo" && (
                  <span className="text-blue-600 dark:text-blue-400">📷 From photo</span>
                )}
                {recipe.sourceType === "url" && (
                  <span className="text-green-600 dark:text-green-400">🔗 From URL</span>
                )}
                {recipe.sourceType === "ai" && (
                  <span className="text-purple-600 dark:text-purple-400">✨ AI generated</span>
                )}
              </div>
            </div>

            <div className="p-4 grid md:grid-cols-2 gap-4 text-sm">
              {/* Ingredients */}
              <div>
                <h4 className="font-medium mb-2">Ingredients ({recipe.ingredients.length})</h4>
                <ul className="space-y-1 text-muted-foreground">
                  {recipe.ingredients.slice(0, 8).map((ing, i) => (
                    <li key={i}>
                      {ing.amount && <span>{ing.amount} </span>}
                      {ing.unit && <span>{ing.unit} </span>}
                      <span>{ing.ingredient}</span>
                      {ing.notes && <span className="italic"> ({ing.notes})</span>}
                    </li>
                  ))}
                  {recipe.ingredients.length > 8 && (
                    <li className="text-xs">...and {recipe.ingredients.length - 8} more</li>
                  )}
                </ul>
              </div>

              {/* Instructions */}
              <div>
                <h4 className="font-medium mb-2">Instructions ({recipe.instructions.length} steps)</h4>
                <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                  {recipe.instructions.slice(0, 4).map((inst, i) => (
                    <li key={i} className="truncate">{inst.description}</li>
                  ))}
                  {recipe.instructions.length > 4 && (
                    <li className="text-xs list-none">...and {recipe.instructions.length - 4} more steps</li>
                  )}
                </ol>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Timeline generated - show interactive preview
    if (part.type === "data-timeline-generated") {
      const data = (part as {
        data: {
          timeline: TimelineTaskData[];
          message: string;
        };
      }).data;

      return (
        <div key={index} className="space-y-3">
          <p className="whitespace-pre-wrap">{data.message}</p>
          <TimelinePreview
            timeline={data.timeline}
            onCurationChange={setCuratedTimeline}
          />
        </div>
      );
    }

    // Show tool result messages to users (e.g., "Added John to the guest list")
    if (part.type === "tool-result") {
      const toolResult = (part as { result?: { message?: string } }).result;
      if (toolResult?.message) {
        return (
          <div key={index} className="text-sm">
            {toolResult.message}
          </div>
        );
      }
      return null;
    }

    // Skip tool-invocation and other internal parts
    if (part.type.startsWith("tool-") || part.type.startsWith("data-")) {
      return null;
    }

    return null;
  }

  return (
    <div className="flex flex-col h-full border-x border-b md:border md:rounded-lg overflow-hidden bg-background">
      {/* Header with progress */}
      <div className="flex items-center justify-center px-4 py-2 border-b">
        <WizardProgress
          currentStep={currentStep}
          onStepClick={handleStepClick}
          furthestStepIndex={session.furthestStepIndex ?? 0}
        />
      </div>

      {/* Main content area with optional sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Chat area */}
        <div className={`flex flex-col ${currentStep === "menu" ? "flex-1 min-w-0" : "w-full"}`}>
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Welcome message for each step */}
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <p className="text-lg font-medium">{getStepWelcome(currentStep)}</p>
                <p className="text-sm mt-2">{getStepInstructions(currentStep)}</p>
              </div>
            )}

            {/* Recipe Picker for menu step */}
            {currentStep === "menu" && (
              <RecipePicker onSelectRecipe={handleRecipeSelect} selectedRecipeIds={selectedRecipeIds} />
            )}

            {/* Current data display */}
            {renderCurrentData()}

            {/* Chat messages */}
            {messages.map((msg) => {
              // Pre-render parts to check if any have content
              const renderedParts = msg.parts.map((part, i) => renderMessagePart(msg, part, i));
              const hasVisibleContent = renderedParts.some((p) => p !== null);

              // Skip rendering the message bubble if no parts have content
              if (!hasVisibleContent) {
                return null;
              }

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {renderedParts}
                  </div>
                </div>
              );
            })}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <div
                      className="w-2 h-2 bg-primary rounded-full animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-4">
            <form onSubmit={handleFormSubmit} className="flex gap-2">
              {/* Image upload button for menu step */}
              {currentStep === "menu" && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 border rounded-md hover:bg-muted flex items-center gap-1 text-sm"
                    title="Upload recipe image"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                </>
              )}

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isGivingFeedback
                    ? "Describe what you'd like to change..."
                    : getInputPlaceholder(currentStep)
                }
                className="flex-1 px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {isLoading ? (
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                )}
              </button>
            </form>

            {/* Cancel/Back/Start Over buttons - left aligned */}
            <div className="flex justify-start items-center gap-4 mt-3">
              <button
                type="button"
                onClick={onCancel}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              {currentStep !== "party-info" && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = WIZARD_STEPS.indexOf(currentStep);
                    if (currentIndex > 0) {
                      setStep(WIZARD_STEPS[currentIndex - 1]);
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={startNewSession}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>

        {/* Menu Sidebar - only shown on menu step, hidden on mobile */}
        {currentStep === "menu" && (
          <div className="hidden md:block w-64 flex-shrink-0">
            <MenuSidebar
              menuPlan={session.menuPlan}
              onRemoveRecipe={handleRemoveMenuItem}
            />
          </div>
        )}
      </div>

      {/* Creating overlay */}
      {isCreating && <WizardCreating />}
    </div>
  );

  function renderCurrentData() {
    if (!session) return null;

    switch (currentStep) {
      case "guests":
        if (!session.guestList || session.guestList.length === 0) return null;
        return (
          <div className="bg-muted/30 p-3 rounded-lg">
            <p className="text-sm font-medium mb-2">Current guest list:</p>
            <ul className="space-y-1">
              {session.guestList.map((guest, i) => (
                <li key={i} className="text-sm flex items-center justify-between">
                  <span>
                    {guest.name || "Guest"} ({guest.email || guest.phone})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      case "menu":
        const menuItems = [
          ...(session.menuPlan?.existingRecipes || []),
          ...(session.menuPlan?.newRecipes || []),
        ];
        if (menuItems.length === 0) return null;
        return (
          <div className="bg-muted/30 p-3 rounded-lg">
            <p className="text-sm font-medium mb-2">Current menu:</p>
            <ul className="space-y-1">
              {menuItems.map((item, i) => (
                <li key={i} className="text-sm">
                  {item.name}
                  {item.course && (
                    <span className="text-muted-foreground ml-2">({item.course})</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      case "timeline":
        if (!session.timeline || session.timeline.length === 0) return null;
        return (
          <div className="bg-muted/30 p-3 rounded-lg max-h-[200px] overflow-y-auto">
            <p className="text-sm font-medium mb-2">Current timeline:</p>
            <ul className="space-y-2">
              {session.timeline.map((task, i) => (
                <li key={i} className="text-sm border-l-2 border-primary/30 pl-3">
                  <span className="font-medium">
                    {task.daysBeforeParty === 0
                      ? "Day of party"
                      : task.daysBeforeParty === 1
                        ? "1 day before"
                        : `${task.daysBeforeParty} days before`}{" "}
                    @ {task.scheduledTime}
                  </span>
                  <p className="text-muted-foreground">{task.description}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      default:
        return null;
    }
  }
}

function getStepWelcome(step: WizardStep): string {
  switch (step) {
    case "party-info":
      return "Let's plan your party!";
    case "guests":
      return "Who's coming?";
    case "menu":
      return "What's on the menu?";
    case "timeline":
      return "Let's create your cooking timeline!";
  }
}

function getStepInstructions(step: WizardStep): string {
  switch (step) {
    case "party-info":
      return "Tell me about your event - what's the occasion, when is it, and where?";
    case "guests":
      return "Add your guests with their email or phone. You can always add more later.";
    case "menu":
      return "Pick recipes from your library, paste a URL, upload an image, or describe a dish.";
    case "timeline":
      return "I'll create a cooking schedule based on your menu. We'll work backwards from party time.";
  }
}

function getInputPlaceholder(step: WizardStep): string {
  switch (step) {
    case "party-info":
      return "Describe your party...";
    case "guests":
      return "Add a guest (name, email or phone)...";
    case "menu":
      return "Describe a dish or paste a recipe URL...";
    case "timeline":
      return "Any adjustments to the timeline?";
  }
}
