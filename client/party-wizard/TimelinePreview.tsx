import React, { useState, useEffect, useMemo } from "react";
import type { TimelineTaskData } from "../../src/lib/wizard-schemas";

interface TimelinePreviewProps {
  timeline: TimelineTaskData[];
  onCurationChange: (curated: TimelineTaskData[]) => void;
}

interface Phase {
  daysBefore: number;
  time: string;
  phaseDescription?: string;
  tasks: Array<{
    index: number;
    task: TimelineTaskData;
  }>;
}

export function TimelinePreview({ timeline, onCurationChange }: TimelinePreviewProps) {
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [splitOutIndices, setSplitOutIndices] = useState<Set<number>>(new Set());

  // Group tasks by phase (split on isPhaseStart)
  const phases = useMemo(() => {
    const result: Phase[] = [];
    let currentPhase: Phase | null = null;

    timeline.forEach((task, index) => {
      if (task.isPhaseStart || !currentPhase) {
        // Start a new phase
        currentPhase = {
          daysBefore: task.daysBeforeParty,
          time: task.scheduledTime,
          phaseDescription: task.phaseDescription,
          tasks: [],
        };
        result.push(currentPhase);
      }
      currentPhase.tasks.push({ index, task });
    });

    return result;
  }, [timeline]);

  // Compute curated timeline whenever state changes
  useEffect(() => {
    const curated = timeline
      .filter((_, index) => !removedIndices.has(index))
      .map((task, _, arr) => {
        // Find original index in the unfiltered timeline
        const originalIndex = timeline.indexOf(task);
        // If split out, mark as phase start (own reminder)
        if (splitOutIndices.has(originalIndex)) {
          return { ...task, isPhaseStart: true };
        }
        return task;
      });
    onCurationChange(curated);
  }, [timeline, removedIndices, splitOutIndices, onCurationChange]);

  function handleToggleRemove(index: number) {
    setRemovedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        // Also remove from split out if it was there
        setSplitOutIndices((splitPrev) => {
          const splitNext = new Set(splitPrev);
          splitNext.delete(index);
          return splitNext;
        });
      }
      return next;
    });
  }

  function handleToggleSplitOut(index: number) {
    setSplitOutIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function formatDayLabel(daysBefore: number): string {
    if (daysBefore === 0) return "Day of party";
    if (daysBefore === 1) return "Day before";
    return `${daysBefore} days before`;
  }

  function formatTime(time: string): string {
    // Convert 24h to 12h format
    const [hours, minutes] = time.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  }

  // Count non-removed, non-split-out tasks in each phase for reminder count
  function countRemindersForPhase(phase: Phase): number {
    // Base: 1 reminder for the phase itself (if it has any non-removed tasks)
    const activeTasks = phase.tasks.filter(({ index }) => !removedIndices.has(index));
    if (activeTasks.length === 0) return 0;

    // Add split-out tasks (they each get their own reminder)
    const splitOutCount = activeTasks.filter(({ index }) => splitOutIndices.has(index)).length;

    // If all active tasks are split out, that's the count
    // Otherwise, 1 for the phase + split-out count
    const nonSplitCount = activeTasks.filter(({ index }) => !splitOutIndices.has(index)).length;
    return (nonSplitCount > 0 ? 1 : 0) + splitOutCount;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Review your timeline below. Remove tasks you don't need, or split out important ones to get their own reminder.
      </p>

      <div className="space-y-3">
        {phases.map((phase, phaseIndex) => {
          const activeTasks = phase.tasks.filter(({ index }) => !removedIndices.has(index));
          const reminderCount = countRemindersForPhase(phase);

          // Skip phases where all tasks are removed
          if (activeTasks.length === 0) {
            return null;
          }

          return (
            <div
              key={phaseIndex}
              className="border rounded-lg overflow-hidden bg-card"
            >
              {/* Phase header */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b">
                <span className="text-sm font-medium">
                  {formatDayLabel(phase.daysBefore)} @ {formatTime(phase.time)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {reminderCount} reminder{reminderCount !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Tasks */}
              <div className="divide-y">
                {phase.tasks.map(({ index, task }) => {
                  const isRemoved = removedIndices.has(index);
                  const isSplitOut = splitOutIndices.has(index);

                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-2 px-3 py-2 text-sm ${
                        isRemoved ? "opacity-40 bg-muted/30" : ""
                      }`}
                    >
                      {/* Task description */}
                      <span
                        className={`flex-1 ${isRemoved ? "line-through" : ""}`}
                      >
                        {task.description}
                        {isSplitOut && !isRemoved && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                              />
                            </svg>
                            Own reminder
                          </span>
                        )}
                      </span>

                      {/* Split out toggle (only for non-phase-start tasks) */}
                      {!task.isPhaseStart && !isRemoved && (
                        <button
                          type="button"
                          onClick={() => handleToggleSplitOut(index)}
                          className={`p-1 rounded hover:bg-muted ${
                            isSplitOut
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-muted-foreground"
                          }`}
                          title={isSplitOut ? "Remove own reminder" : "Give own reminder"}
                        >
                          <svg
                            className="w-4 h-4"
                            fill={isSplitOut ? "currentColor" : "none"}
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                            />
                          </svg>
                        </button>
                      )}

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => handleToggleRemove(index)}
                        className={`p-1 rounded hover:bg-muted ${
                          isRemoved
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground hover:text-red-500"
                        }`}
                        title={isRemoved ? "Restore task" : "Remove task"}
                      >
                        {isRemoved ? (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground text-center">
        {timeline.length - removedIndices.size} of {timeline.length} tasks selected
      </p>
    </div>
  );
}
