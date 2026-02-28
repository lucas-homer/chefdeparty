import React from "react";
import {
  Calendar,
  MapPin,
  PartyPopper,
  UserPlus,
  Users,
  UtensilsCrossed,
  Link,
  Camera,
  Sparkles,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import type { WizardStep } from "./types";

interface Suggestion {
  label: string;
  message: string;
  icon: LucideIcon;
}

interface SuggestionChipsProps {
  step: WizardStep;
  onSelect: (message: string) => void;
  disabled?: boolean;
  hasMessages: boolean;
}

const INITIAL_SUGGESTIONS: Record<WizardStep, Suggestion[]> = {
  "party-info": [
    {
      label: "Birthday party",
      message: "I'm planning a birthday party",
      icon: PartyPopper,
    },
    {
      label: "Dinner party",
      message: "I'd like to host a dinner party",
      icon: UtensilsCrossed,
    },
    {
      label: "This weekend",
      message: "I'm throwing a party this weekend",
      icon: Calendar,
    },
    {
      label: "At my place",
      message: "I'm hosting a get-together at my place",
      icon: MapPin,
    },
  ],
  guests: [
    {
      label: "Add a few friends",
      message: "I'd like to add a few guests",
      icon: UserPlus,
    },
    {
      label: "Skip for now",
      message: "I'll add guests later, let's move on",
      icon: Users,
    },
  ],
  menu: [
    {
      label: "Suggest a menu",
      message: "Can you suggest a menu for my party?",
      icon: Sparkles,
    },
    {
      label: "Paste a recipe URL",
      message: "I have a recipe URL to add",
      icon: Link,
    },
    {
      label: "Upload a recipe photo",
      message: "I'll upload a photo of a recipe",
      icon: Camera,
    },
    {
      label: "Browse my recipes",
      message: "Show me recipes from my library",
      icon: UtensilsCrossed,
    },
  ],
  timeline: [
    {
      label: "Generate timeline",
      message: "Please generate a cooking timeline for my party",
      icon: Clock3,
    },
    {
      label: "Keep it simple",
      message: "Create a simple, minimal prep timeline",
      icon: Sparkles,
    },
  ],
};

export function SuggestionChips({
  step,
  onSelect,
  disabled,
  hasMessages,
}: SuggestionChipsProps) {
  // Only show suggestions when there are no messages yet
  if (hasMessages) return null;

  const suggestions = INITIAL_SUGGESTIONS[step];
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2 px-4 py-3 animate-fade-in">
      {suggestions.map((suggestion) => {
        const Icon = suggestion.icon;
        return (
          <button
            key={suggestion.label}
            type="button"
            onClick={() => onSelect(suggestion.message)}
            disabled={disabled}
            className="group inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-4 py-2 text-sm font-medium text-foreground shadow-warm-sm backdrop-blur-sm transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-warm-md active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
            <span>{suggestion.label}</span>
          </button>
        );
      })}
    </div>
  );
}
