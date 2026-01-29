// Google Calendar API integration

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface CalendarEvent {
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone?: string;
  };
  end: {
    dateTime: string;
    timeZone?: string;
  };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: "email" | "popup";
      minutes: number;
    }>;
  };
}

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// Generate OAuth URL for calendar access
export function getCalendarAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_OAUTH_URL}?${params.toString()}`;
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleTokens> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code: ${error}`);
  }

  return response.json();
}

// Refresh access token using refresh token
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  return response.json();
}

// Create a calendar event
export async function createCalendarEvent(
  accessToken: string,
  event: CalendarEvent
): Promise<{ id: string }> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create event: ${error}`);
  }

  return response.json();
}

// Update a calendar event
export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEvent
): Promise<{ id: string }> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update event: ${error}`);
  }

  return response.json();
}

// Delete a calendar event
export async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events/${eventId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // 410 Gone means already deleted, which is fine
  if (!response.ok && response.status !== 410) {
    const error = await response.text();
    throw new Error(`Failed to delete event: ${error}`);
  }
}

// Convert a timeline task to a calendar event with optional reminders
export function taskToCalendarEvent(
  task: {
    description: string;
    scheduledDate: Date;
    scheduledTime?: string | null;
    durationMinutes?: number | null;
    isPhaseStart?: boolean | null;
    phaseDescription?: string | null;
  },
  partyName: string,
  options?: {
    reminderMinutesBefore?: number; // Default: 60 (1 hour)
  }
): CalendarEvent {
  const startDate = new Date(task.scheduledDate);

  // Set time if provided
  if (task.scheduledTime) {
    const [hours, minutes] = task.scheduledTime.split(":").map(Number);
    startDate.setHours(hours, minutes, 0, 0);
  } else {
    // Default to 9 AM for tasks without specific time
    startDate.setHours(9, 0, 0, 0);
  }

  const durationMs = (task.durationMinutes || 30) * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  const reminderMinutes = options?.reminderMinutesBefore ?? 60;

  // Use phaseDescription for phase starts if available
  const summary = task.isPhaseStart && task.phaseDescription
    ? `[${partyName}] ${task.phaseDescription}`
    : `[${partyName}] ${task.description}`;

  // Only add reminders for phase-start tasks
  const reminders: CalendarEvent["reminders"] = task.isPhaseStart
    ? {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: reminderMinutes },
          { method: "popup", minutes: 15 }, // Also 15 min before
        ],
      }
    : {
        useDefault: false,
        overrides: [], // No reminders for non-phase tasks
      };

  return {
    summary,
    description: task.isPhaseStart && task.phaseDescription
      ? `${task.description}\n\nCooking task for ${partyName}`
      : `Cooking task for ${partyName}`,
    start: {
      dateTime: startDate.toISOString(),
    },
    end: {
      dateTime: endDate.toISOString(),
    },
    reminders,
  };
}

// Check if scope includes calendar access
export function hasCalendarAccess(scope: string | null): boolean {
  if (!scope) return false;
  return (
    scope.includes("https://www.googleapis.com/auth/calendar") ||
    scope.includes("https://www.googleapis.com/auth/calendar.events")
  );
}
