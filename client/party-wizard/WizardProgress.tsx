import React from "react";
import type { WizardStep } from "./types";
import { WIZARD_STEPS, STEP_LABELS } from "./types";

interface WizardProgressProps {
  currentStep: WizardStep;
  onStepClick?: (step: WizardStep) => void;
  completedSteps?: WizardStep[];
}

export function WizardProgress({
  currentStep,
  onStepClick,
  completedSteps = [],
}: WizardProgressProps) {
  const currentIndex = WIZARD_STEPS.indexOf(currentStep);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
      {WIZARD_STEPS.map((step, index) => {
        const isComplete = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isPast = index < currentIndex;
        const canClick = isPast || isComplete;

        return (
          <React.Fragment key={step}>
            {/* Step indicator */}
            <button
              onClick={() => canClick && onStepClick?.(step)}
              disabled={!canClick}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium
                transition-colors
                ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isComplete || isPast
                      ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                }
              `}
            >
              <span
                className={`
                  flex items-center justify-center w-5 h-5 rounded-full text-xs
                  ${
                    isCurrent
                      ? "bg-primary-foreground/20"
                      : isComplete || isPast
                        ? "bg-primary/20"
                        : "bg-muted-foreground/20"
                  }
                `}
              >
                {isComplete ? (
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
            </button>

            {/* Connector line */}
            {index < WIZARD_STEPS.length - 1 && (
              <div
                className={`
                  flex-1 h-0.5 mx-2
                  ${isPast || isComplete ? "bg-primary/40" : "bg-muted"}
                `}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
