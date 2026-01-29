import React, { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { hc } from "hono/client";
import type { ApiRoutes } from "../src/routes/api";

// Create typed client
const client = hc<ApiRoutes>("/api");

interface CalendarCardProps {
  connected: boolean;
  calendarEmail?: string;
}

function CalendarCard({ connected: initialConnected, calendarEmail }: CalendarCardProps) {
  const [connected, setConnected] = useState(initialConnected);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(() => {
    // Redirect to OAuth flow
    window.location.href = "/api/calendar/connect";
  }, []);

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await client.calendar.disconnect.$post();

      if (!response.ok) {
        const err = await response.json();
        throw new Error("error" in err ? err.error : "Failed to disconnect");
      }

      setConnected(false);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="border rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="p-2 bg-muted rounded-lg">
          <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Google Calendar</h3>
          {connected ? (
            <>
              <p className="text-sm text-muted-foreground mt-1">
                Connected{calendarEmail && <> as {calendarEmail}</>}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Timeline tasks will sync to your calendar with reminders.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">
              Connect to sync timeline tasks and get calendar reminders.
            </p>
          )}
        </div>
        <div>
          {connected ? (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
            >
              {loading ? "Disconnecting..." : "Disconnect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
          {error}
        </div>
      )}
    </div>
  );
}

// Initialize when DOM is ready
function init() {
  const root = document.getElementById("calendar-card-root");
  if (!root) return;

  const connected = root.dataset.connected === "true";
  const calendarEmail = root.dataset.email || undefined;

  createRoot(root).render(<CalendarCard connected={connected} calendarEmail={calendarEmail} />);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

export { CalendarCard };
