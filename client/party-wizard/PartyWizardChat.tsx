import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback,
  FormEvent,
  KeyboardEvent,
  startTransition,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Textarea } from "@/components/ui/textarea";
import { WizardProgress } from "./WizardProgress";
import { WizardCreating } from "./WizardCreating";
import { RecipePicker } from "./RecipePicker";
import { TimelinePreview } from "./TimelinePreview";
import type { TimelineCurationSubmission } from "./TimelinePreview";
import { useWizardState } from "./useWizardState";
import { MobileSidebarTrigger, DesktopSidebarAside } from "./WizardSidebarContainer";
import type { WizardSidebarItem } from "./WizardSidebar";
import { SuggestionChips } from "./SuggestionChips";
import { ToolInvocationIndicator } from "./ToolInvocationIndicator";
import {
  ArrowUp,
  BookOpen,
  Camera,
  Clock3,
  Image as ImageIcon,
  Link,
  Sparkles,
  User,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import type {
  WizardStep,
  UserRecipe,
  TimelineTaskData,
} from "./types";
import { WIZARD_STEPS } from "./types";
import {
  getToolOutputMessage,
  hasNonEmptyTextPart,
  isToolPartError,
  shouldRefreshSessionFromAssistantMessage,
} from "@/lib/wizard-message-parts";

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
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        prepareSendMessagesRequest: ({ messages: msgs }) => {
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
    let hasStepTransition = false;

    if (shouldRefreshSessionFromAssistantMessage(message)) {
      needsRefresh = true;
    }

    for (const part of message.parts) {
      if (part.type === "data-step-confirmed") {
        const data = (part as { data: { nextStep: string } }).data;
        console.log("[PartyWizardChat] Step confirmed, next step:", data.nextStep);

        if (data.nextStep === "complete") {
          // Trigger party creation
          handleWizardComplete();
        } else {
          hasStepTransition = true;
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
    if (needsRefresh && !hasStepTransition) {
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
        let message = "Failed to create party";
        try {
          const errorBody = await response.json() as { error?: string };
          if (errorBody?.error) {
            message = errorBody.error;
          }
        } catch {
          // Ignore JSON parse failures and use the fallback message.
        }
        throw new Error(message);
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

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
      return;
    }

    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (isGivingFeedback && feedbackRequestId) {
      handleSubmitRevisionFeedback(input);
    } else {
      sendMessage({ text: input });
      setInput("");
    }
  }

  const handleTimelineSubmit = useCallback((submission: TimelineCurationSubmission) => {
    if (isLoading) return;

    setCuratedTimeline(submission.curatedTimeline);
    sendMessage({ text: submission.feedbackMessage });
  }, [isLoading, sendMessage]);

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

  // Handle removing a guest from the sidebar - calls API directly for instant removal
  async function handleRemoveGuest(index: number) {
    try {
      const response = await fetch("/api/parties/wizard/guest", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          index,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to remove guest");
      }

      refreshSession();
    } catch (err) {
      console.error("[PartyWizardChat] Failed to remove guest:", err);
      setError(err instanceof Error ? err.message : "Failed to remove guest");
    }
  }

  // Get selected recipe IDs for the picker
  const selectedRecipeIds = [
    ...(session.menuPlan?.existingRecipes?.map((r) => r.recipeId) || []),
  ];

  // Build sidebar items + config for the current step
  function getRecipeSourceIcon(sourceType?: string): React.ReactNode {
    const cls = "w-4 h-4";
    switch (sourceType) {
      case "photo": return <Camera className={cls} />;
      case "url": return <Link className={cls} />;
      case "ai": return <Sparkles className={cls} />;
      default: return <BookOpen className={cls} />;
    }
  }

  function getSidebarConfig(): {
    items: WizardSidebarItem[];
    onRemove?: (id: string) => void;
    title: string;
    emptyMessage: string;
    emptyHint?: string;
    triggerIcon: React.ReactNode;
    triggerLabel: string;
    footer?: React.ReactNode;
  } | null {
    if (currentStep === "guests") {
      const guestList = session.guestList || [];
      return {
        title: "Guests",
        items: guestList.map((guest, i) => ({
          id: String(i),
          label: guest.name || "Guest",
          sublabel: guest.email || guest.phone,
          icon: <User className="w-4 h-4" />,
        })),
        onRemove: (id) => handleRemoveGuest(Number(id)),
        emptyMessage: "No guests yet",
        emptyHint: "Add guests with their email or phone number.",
        triggerIcon: <Users className="w-4 h-4" />,
        triggerLabel: "guests",
      };
    }

    if (currentStep === "menu") {
      const existingRecipes = session.menuPlan?.existingRecipes || [];
      const newRecipes = session.menuPlan?.newRecipes || [];
      const items: WizardSidebarItem[] = [
        ...existingRecipes.map((recipe, i) => ({
          id: `existing-${i}`,
          label: recipe.name,
          icon: <BookOpen className="w-4 h-4" />,
        })),
        ...newRecipes.map((recipe, i) => ({
          id: `new-${i}`,
          label: recipe.name,
          icon: getRecipeSourceIcon(recipe.sourceType),
        })),
      ];
      return {
        title: "Menu",
        items,
        onRemove: (id) => {
          const [type, indexStr] = id.split("-");
          handleRemoveMenuItem(Number(indexStr), type === "new");
        },
        emptyMessage: "No recipes yet",
        emptyHint: "Add recipes by pasting URLs, uploading photos, or describing dishes.",
        triggerIcon: <UtensilsCrossed className="w-4 h-4" />,
        triggerLabel: "recipes",
        footer: items.length > 0 ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> library</span>
            <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> photo</span>
            <span className="flex items-center gap-1"><Link className="w-3 h-3" /> URL</span>
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI</span>
          </div>
        ) : undefined,
      };
    }

    if (currentStep === "timeline") {
      const timeline = session.timeline || [];
      return {
        title: "Current Timeline",
        items: timeline.map((task, i) => ({
          id: String(i),
          label: `${formatTimelineDay(task.daysBeforeParty)} @ ${task.scheduledTime}`,
          sublabel: task.description,
          icon: <Clock3 className="w-4 h-4" />,
        })),
        emptyMessage: "No timeline tasks yet",
        emptyHint: "Timeline tasks will appear after generation.",
        triggerIcon: <Clock3 className="w-4 h-4" />,
        triggerLabel: "timeline tasks",
      };
    }

    return null;
  }

  const sidebarConfig = getSidebarConfig();

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
        <div key={index} className="mt-3 rounded-xl border border-border/60 bg-card/80 p-4 shadow-warm-sm backdrop-blur-sm">
          <h3 className="font-medium mb-3 text-sm uppercase tracking-wide text-muted-foreground">
            Confirm {request.step}
          </h3>
          {renderConfirmationContent()}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleApprove(request.id)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-warm-sm transition-all hover:bg-primary/90 active:scale-[0.97] disabled:opacity-50"
            >
              Confirm & Continue
            </button>
            <button
              type="button"
              onClick={() => handleRevise(request.id)}
              disabled={isLoading}
              className="rounded-lg border border-border/80 px-4 py-2 text-sm transition-all hover:bg-muted active:scale-[0.97]"
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
          <div key={index} className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Confirmed
          </div>
        );
      } else {
        return (
          <div key={index} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Requesting changes...
          </div>
        );
      }
    }

    if (part.type === "data-step-confirmed") {
      const data = (part as { data: { nextStep: string } }).data;
      return (
        <div key={index} className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {data.nextStep === "complete"
            ? "All steps complete! Creating your party..."
            : `Moving to ${data.nextStep}...`}
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
            onSubmit={handleTimelineSubmit}
            isSubmitting={isLoading}
          />
        </div>
      );
    }

    // Tool invocation - show indicator with pending/complete state
    if (part.type === "tool-invocation") {
      const invocation = part as {
        toolInvocation: {
          toolName: string;
          state: string;
          result?: { message?: string; error?: string };
        };
      };
      const { toolName, state, result } = invocation.toolInvocation;
      const toolState =
        state === "result"
          ? "complete"
          : state === "partial-call" || state === "call"
            ? "pending"
            : (state as "pending" | "streaming" | "complete" | "error");

      return (
        <ToolInvocationIndicator
          key={index}
          toolName={toolName}
          state={toolState}
          result={result}
        />
      );
    }

    // Show tool result messages to users (e.g., "Added John to the guest list")
    if (part.type === "tool-result") {
      const toolResult = (part as { result?: { message?: string } }).result;
      if (toolResult?.message) {
        return (
          <div key={index} className="text-sm text-muted-foreground">
            {toolResult.message}
          </div>
        );
      }
      return null;
    }

    if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
      const toolMessage = getToolOutputMessage(part);
      if (!toolMessage) {
        return null;
      }

      const isErrorPart = isToolPartError(part);

      // Avoid duplicate content when the assistant already included a text part.
      if (!isErrorPart && hasNonEmptyTextPart(msg)) {
        return null;
      }

      return (
        <div
          key={index}
          className={isErrorPart ? "text-sm text-amber-700 dark:text-amber-400" : "text-sm text-muted-foreground"}
        >
          {toolMessage}
        </div>
      );
    }

    // Skip tool-invocation and other internal parts
    if (part.type.startsWith("data-")) {
      return null;
    }

    return null;
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-background">
      {/* Header with progress */}
      <div className="sticky top-[65px] z-20 flex items-center justify-center px-4 py-2 bg-background/95 backdrop-blur">
        <WizardProgress
          currentStep={currentStep}
          onStepClick={handleStepClick}
          furthestStepIndex={session.furthestStepIndex ?? 0}
        />
      </div>

      {/* Main content area with optional sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Chat area */}
        <div className={`flex min-h-0 flex-col ${sidebarConfig ? "flex-1 min-w-0" : "w-full"}`}>
          {/* Messages area */}
          <div
            data-testid="wizard-messages-scroll"
            className="flex-1 min-h-0 overflow-y-auto p-4 pb-44 space-y-4"
          >
            {/* Welcome message for each step */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 sm:py-16 animate-fade-in">
                <h2 className="text-2xl sm:text-3xl font-heading font-semibold text-foreground mb-2">
                  {getStepWelcome(currentStep)}
                </h2>
                <p className="text-sm sm:text-base text-muted-foreground max-w-md text-center">
                  {getStepInstructions(currentStep)}
                </p>
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

              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end animate-slide-up">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-warm-sm">
                      {renderedParts}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="flex justify-start gap-3 animate-slide-up">
                  <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="max-w-[85%] space-y-2">
                    {renderedParts}
                  </div>
                </div>
              );
            })}

            {/* Loading indicator - shows typing dots when AI has no streaming content yet */}
            {isLoading && !messages.some((m) => m.role === "assistant" && m.id === messages[messages.length - 1]?.id && status === "streaming") && (
              <div className="flex justify-start gap-3 animate-fade-in">
                <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3">
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <div
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
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

          {/* Command Bar Input Area */}
          <div className="sticky bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-6">
            <div className="mx-auto max-w-2xl">
              {/* Suggestion chips */}
              <SuggestionChips
                step={currentStep}
                onSelect={(message) => {
                  sendMessage({ text: message });
                }}
                disabled={isLoading}
                hasMessages={messages.length > 0}
              />

              {/* Mobile sidebar trigger */}
              {sidebarConfig && (
                <MobileSidebarTrigger
                  title={sidebarConfig.title}
                  items={sidebarConfig.items}
                  onRemove={sidebarConfig.onRemove}
                  emptyMessage={sidebarConfig.emptyMessage}
                  emptyHint={sidebarConfig.emptyHint}
                  footer={sidebarConfig.footer}
                  triggerIcon={sidebarConfig.triggerIcon}
                  triggerLabel={sidebarConfig.triggerLabel}
                />
              )}

              {/* Command bar */}
              <form onSubmit={handleFormSubmit}>
                <div className="command-bar group relative rounded-2xl border border-border/80 bg-card shadow-warm-lg transition-all focus-within:border-primary/40 focus-within:shadow-[0_0_0_1px_hsl(var(--primary)/0.15),0_4px_12px_hsl(var(--shadow-color)/0.08)]">
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={
                      isGivingFeedback
                        ? "Describe what you'd like to change..."
                        : getInputPlaceholder(currentStep)
                    }
                    className="min-h-[52px] max-h-40 resize-none border-0 bg-transparent px-4 py-3 pr-12 shadow-none ring-0 focus-visible:ring-0 focus-visible:outline-none"
                    disabled={isLoading}
                    rows={1}
                  />

                  {/* Action row inside the command bar */}
                  <div className="flex items-center gap-1 px-3 pb-2.5">
                    {/* Image upload for menu step */}
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
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Upload recipe image"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                      </>
                    )}

                    {/* Secondary actions */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
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
                          className="rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
                        >
                          Back
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={startNewSession}
                        className="rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Start over
                      </button>
                    </div>

                    {/* Send button */}
                    <button
                      type="submit"
                      aria-label="Send message"
                      disabled={isLoading || !input.trim()}
                      className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30 disabled:hover:bg-primary"
                    >
                      {isLoading ? (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
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
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Desktop sidebar - shown for steps with sidebar data */}
        {sidebarConfig && (
          <DesktopSidebarAside
            title={sidebarConfig.title}
            items={sidebarConfig.items}
            onRemove={sidebarConfig.onRemove}
            emptyMessage={sidebarConfig.emptyMessage}
            emptyHint={sidebarConfig.emptyHint}
            footer={sidebarConfig.footer}
          />
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
        // Guest list is now shown in the sidebar
        return null;
      case "menu": {
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
      }
      case "timeline":
        // Timeline is shown in the sidebar for this step.
        return null;
      default:
        return null;
    }
  }
}

function formatTimelineDay(daysBeforeParty: number): string {
  if (daysBeforeParty === 0) return "Day of party";
  if (daysBeforeParty === 1) return "1 day before";
  return `${daysBeforeParty} days before`;
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
