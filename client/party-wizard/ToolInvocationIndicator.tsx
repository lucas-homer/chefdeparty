import React from "react";
import {
  UserPlus,
  UtensilsCrossed,
  Clock3,
  PartyPopper,
  Link,
  Camera,
  Sparkles,
  CheckCircle2,
  Loader2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react";

type ToolState = "pending" | "streaming" | "complete" | "error";

interface ToolInvocationIndicatorProps {
  toolName: string;
  state: ToolState;
  result?: { message?: string; error?: string };
}

interface ToolMeta {
  label: string;
  icon: LucideIcon;
  pendingLabel: string;
}

const TOOL_META: Record<string, ToolMeta> = {
  confirmPartyInfo: {
    label: "Party details confirmed",
    icon: PartyPopper,
    pendingLabel: "Saving party details...",
  },
  addGuest: {
    label: "Guest added",
    icon: UserPlus,
    pendingLabel: "Adding guest...",
  },
  removeGuest: {
    label: "Guest removed",
    icon: UserPlus,
    pendingLabel: "Removing guest...",
  },
  confirmGuestList: {
    label: "Guest list confirmed",
    icon: UserPlus,
    pendingLabel: "Confirming guest list...",
  },
  addExistingRecipe: {
    label: "Recipe added from library",
    icon: UtensilsCrossed,
    pendingLabel: "Adding recipe...",
  },
  generateRecipeIdea: {
    label: "Recipe generated",
    icon: Sparkles,
    pendingLabel: "Creating a recipe...",
  },
  extractRecipeFromUrl: {
    label: "Recipe extracted",
    icon: Link,
    pendingLabel: "Extracting recipe from URL...",
  },
  extractRecipeFromImage: {
    label: "Recipe extracted from image",
    icon: Camera,
    pendingLabel: "Reading recipe from image...",
  },
  proposeMenu: {
    label: "Menu proposed",
    icon: UtensilsCrossed,
    pendingLabel: "Putting together a menu...",
  },
  removeMenuItem: {
    label: "Menu item removed",
    icon: UtensilsCrossed,
    pendingLabel: "Removing menu item...",
  },
  generateTimeline: {
    label: "Timeline generated",
    icon: Clock3,
    pendingLabel: "Building your cooking timeline...",
  },
  confirmMenu: {
    label: "Menu confirmed",
    icon: UtensilsCrossed,
    pendingLabel: "Confirming menu...",
  },
  confirmTimeline: {
    label: "Timeline confirmed",
    icon: Clock3,
    pendingLabel: "Confirming timeline...",
  },
};

const DEFAULT_META: ToolMeta = {
  label: "Action completed",
  icon: Sparkles,
  pendingLabel: "Working on it...",
};

export function ToolInvocationIndicator({
  toolName,
  state,
  result,
}: ToolInvocationIndicatorProps) {
  const meta = TOOL_META[toolName] || DEFAULT_META;
  const Icon = meta.icon;
  const isPending = state === "pending" || state === "streaming";
  const isError = state === "error";

  return (
    <div className="tool-invocation-indicator flex items-center gap-2.5 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
      {/* Tool icon */}
      <div
        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${
          isError
            ? "bg-destructive/10 text-destructive"
            : isPending
              ? "bg-primary/10 text-primary"
              : "bg-accent text-accent-foreground"
        }`}
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isError ? (
          <AlertCircle className="h-3.5 w-3.5" />
        ) : (
          <Icon className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Label */}
      <span
        className={`flex-1 ${
          isError
            ? "text-destructive"
            : isPending
              ? "text-muted-foreground"
              : "text-foreground"
        }`}
      >
        {isPending
          ? meta.pendingLabel
          : isError
            ? result?.error || "Something went wrong"
            : result?.message || meta.label}
      </span>

      {/* Status icon */}
      {!isPending && !isError && (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" />
      )}
    </div>
  );
}
