import React from "react";
import { Check } from "lucide-react";
import type { WizardStep } from "./types";
import { WIZARD_STEPS, STEP_LABELS, STEP_LABELS_SHORT } from "./types";

interface WizardProgressProps {
  currentStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
  furthestStepIndex?: number; // 0 = party-info, 1 = guests, 2 = menu, 3 = timeline
}

export function WizardProgress({
  currentStep,
  onStepClick,
  furthestStepIndex = 0,
}: WizardProgressProps) {
  return (
    <div className="flex items-center justify-between px-2 sm:px-4 py-3 overflow-x-auto">
      {WIZARD_STEPS.map((step, index) => {
        const isCurrent = step === currentStep;
        // A step is reachable if it's at or before the furthest step we've reached
        const isReachable = index <= furthestStepIndex;
        // A step is "complete" (shows checkmark) if it's before the furthest step
        const isComplete = index < furthestStepIndex;
        const canClick = isReachable && !isCurrent;

        return (
          <React.Fragment key={step}>
            {/* Step indicator */}
            <button
              onClick={() => canClick && onStepClick?.(step)}
              disabled={!canClick}
              className={`
                flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium
                transition-all whitespace-nowrap flex-shrink-0
                ${
                  isCurrent
                    ? "bg-primary text-primary-foreground shadow-warm-sm"
                    : isReachable
                      ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                      : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                }
              `}
            >
              <span
                className={`
                  flex items-center justify-center w-5 h-5 rounded-full text-xs font-semibold
                  ${
                    isCurrent
                      ? "bg-primary-foreground/20"
                      : isComplete
                        ? "bg-primary/20"
                        : isReachable
                          ? "bg-primary/15"
                          : "bg-muted-foreground/15"
                  }
                `}
              >
                {isComplete ? (
                  <Check className="w-3 h-3" />
                ) : (
                  index + 1
                )}
              </span>
              {/* Short label on mobile, full label on desktop */}
              <span className="sm:hidden">{STEP_LABELS_SHORT[step]}</span>
              <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
            </button>

            {/* Connector line */}
            {index < WIZARD_STEPS.length - 1 && (
              <div
                className={`
                  flex-1 h-px mx-1.5 sm:mx-2.5 min-w-3
                  transition-colors duration-300
                  ${index < furthestStepIndex ? "bg-primary/40" : "bg-border"}
                `}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
