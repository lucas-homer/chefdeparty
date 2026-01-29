import React, { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { hc } from "hono/client";
import type { ApiRoutes } from "../src/routes/api";

// Create typed client
const client = hc<ApiRoutes>("/api");

// Types from the server
interface TimelineTask {
  id: string;
  description: string;
  scheduledDate: Date;
  scheduledTime: string | null;
  durationMinutes: number | null;
  completed: boolean;
  isPhaseStart: boolean;
  phaseDescription: string | null;
  recipeName: string | null;
}

interface TimelineAppProps {
  partyId: string;
  initialTasks: TimelineTask[];
}

function TimelineApp({ partyId, initialTasks }: TimelineAppProps) {
  const [tasks, setTasks] = useState<TimelineTask[]>(initialTasks);
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const toggleTask = useCallback(
    async (taskId: string, completed: boolean) => {
      // Optimistic update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, completed } : t))
      );
      setLoading((prev) => ({ ...prev, [taskId]: true }));

      try {
        const response = await client.parties[":id"].timeline[":taskId"].$patch({
          param: { id: partyId, taskId },
          json: { completed },
        });

        if (!response.ok) {
          // Revert on error
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, completed: !completed } : t))
          );
        }
      } catch (error) {
        // Revert on error
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, completed: !completed } : t))
        );
      } finally {
        setLoading((prev) => ({ ...prev, [taskId]: false }));
      }
    },
    [partyId]
  );

  const formatTime = (time: string | null): string => {
    if (!time) return "";
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      {tasks.map((task) => (
        <div
          key={task.id}
          className={`p-4 rounded-lg border ${
            task.completed ? "bg-muted/50" : "bg-card"
          } ${task.isPhaseStart ? "border-l-4 border-l-primary" : ""}`}
        >
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggleTask(task.id, !task.completed)}
              disabled={loading[task.id]}
              className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                task.completed
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground hover:border-primary"
              } ${loading[task.id] ? "opacity-50" : ""}`}
            >
              {task.completed && (
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              {task.isPhaseStart && task.phaseDescription && (
                <p className="text-xs font-medium text-primary mb-1">
                  {task.phaseDescription}
                </p>
              )}
              <p
                className={`${
                  task.completed ? "line-through text-muted-foreground" : ""
                }`}
              >
                {task.description}
              </p>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {task.scheduledTime && <span>{formatTime(task.scheduledTime)}</span>}
                {task.durationMinutes && (
                  <span>({task.durationMinutes} min)</span>
                )}
                {task.recipeName && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">
                    {task.recipeName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Initialize when DOM is ready
function init() {
  const root = document.getElementById("timeline-root");
  if (!root) return;

  const initialData = root.dataset.initial;
  const partyId = root.dataset.partyId;

  if (!initialData || !partyId) return;

  try {
    const tasks = JSON.parse(initialData);
    createRoot(root).render(<TimelineApp partyId={partyId} initialTasks={tasks} />);
  } catch (error) {
    console.error("Failed to initialize timeline:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { TimelineApp };
