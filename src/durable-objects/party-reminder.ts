import { DurableObject } from "cloudflare:workers";

interface ScheduledReminder {
  taskIds: string[];
  reminderType: "heads-up" | "day-before" | "day-of";
  scheduledFor: number; // Unix timestamp
}

interface PartyReminderState {
  partyId: string;
  hostUserId: string;
  hostEmail: string;
  hostName: string | null;
  partyName: string;
  partyDateTime: number;
  partyLocation: string | null;
  shareToken: string;
  hasCalendarSync: boolean;
  scheduledReminders: ScheduledReminder[];
}

interface TaskForReminder {
  id: string;
  description: string;
  scheduledDate: number; // Unix timestamp
  scheduledTime: string | null;
  durationMinutes: number | null;
  recipeName: string | null;
  // Recipe metadata that affects reminder timing
  requiresAdvancePrep?: boolean; // e.g., marinating, brining
  advancePrepHours?: number;
}

interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  APP_URL?: string;
}

export class PartyReminder extends DurableObject<Env> {
  private state: PartyReminderState | null = null;

  async getState(): Promise<PartyReminderState | null> {
    if (!this.state) {
      this.state = await this.ctx.storage.get<PartyReminderState>("state") || null;
    }
    return this.state;
  }

  async setState(state: PartyReminderState): Promise<void> {
    this.state = state;
    await this.ctx.storage.put("state", state);
  }

  // Called when timeline is generated or updated
  async scheduleReminders(input: {
    partyId: string;
    hostUserId: string;
    hostEmail: string;
    hostName: string | null;
    partyName: string;
    partyDateTime: number;
    partyLocation: string | null;
    shareToken: string;
    hasCalendarSync: boolean;
    tasks: TaskForReminder[];
  }): Promise<{ scheduled: number }> {
    // If user has calendar sync, don't schedule email reminders
    if (input.hasCalendarSync) {
      // Clear any existing alarms
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.delete("state");
      this.state = null;
      return { scheduled: 0 };
    }

    const now = Date.now();
    const reminders: ScheduledReminder[] = [];

    // Group tasks by their reminder timing
    const headsUpTasks: string[] = []; // 48h+ before party
    const dayBeforeTasks: string[] = [];
    const dayOfTasks: string[] = [];

    for (const task of input.tasks) {
      const taskTime = task.scheduledDate;
      const hoursUntilTask = (taskTime - now) / (1000 * 60 * 60);

      // Skip tasks in the past
      if (hoursUntilTask < 0) continue;

      // Determine reminder type based on when task is scheduled
      if (hoursUntilTask >= 48) {
        // Task is 48h+ away - send heads-up reminder 24h before the task
        headsUpTasks.push(task.id);
      } else if (hoursUntilTask >= 24) {
        // Task is 24-48h away - day-before reminder
        dayBeforeTasks.push(task.id);
      } else {
        // Task is within 24h - day-of reminder
        dayOfTasks.push(task.id);
      }

      // Special handling for tasks requiring advance prep
      if (task.requiresAdvancePrep && task.advancePrepHours) {
        const advanceReminderTime = taskTime - (task.advancePrepHours * 60 * 60 * 1000);
        if (advanceReminderTime > now) {
          // Schedule a special heads-up for advance prep items
          reminders.push({
            taskIds: [task.id],
            reminderType: "heads-up",
            scheduledFor: advanceReminderTime - (2 * 60 * 60 * 1000), // 2h before prep should start
          });
        }
      }
    }

    // Calculate reminder times
    const partyDate = new Date(input.partyDateTime);

    // Heads-up reminder: 2 days before party at 9 AM
    if (headsUpTasks.length > 0) {
      const headsUpDate = new Date(partyDate);
      headsUpDate.setDate(headsUpDate.getDate() - 2);
      headsUpDate.setHours(9, 0, 0, 0);
      if (headsUpDate.getTime() > now) {
        reminders.push({
          taskIds: headsUpTasks,
          reminderType: "heads-up",
          scheduledFor: headsUpDate.getTime(),
        });
      }
    }

    // Day-before reminder: 1 day before party at 9 AM
    if (dayBeforeTasks.length > 0 || headsUpTasks.length > 0) {
      const dayBeforeDate = new Date(partyDate);
      dayBeforeDate.setDate(dayBeforeDate.getDate() - 1);
      dayBeforeDate.setHours(9, 0, 0, 0);
      if (dayBeforeDate.getTime() > now) {
        reminders.push({
          taskIds: [...dayBeforeTasks, ...headsUpTasks.filter(id => {
            const task = input.tasks.find(t => t.id === id);
            return task && (task.scheduledDate - now) / (1000 * 60 * 60) < 48;
          })],
          reminderType: "day-before",
          scheduledFor: dayBeforeDate.getTime(),
        });
      }
    }

    // Day-of reminder: Day of party at 8 AM
    const allTasksForDayOf = [...new Set([...headsUpTasks, ...dayBeforeTasks, ...dayOfTasks])];
    if (allTasksForDayOf.length > 0) {
      const dayOfDate = new Date(partyDate);
      dayOfDate.setHours(8, 0, 0, 0);
      if (dayOfDate.getTime() > now) {
        reminders.push({
          taskIds: allTasksForDayOf,
          reminderType: "day-of",
          scheduledFor: dayOfDate.getTime(),
        });
      }
    }

    // Sort reminders by time and deduplicate
    reminders.sort((a, b) => a.scheduledFor - b.scheduledFor);

    // Store state
    await this.setState({
      partyId: input.partyId,
      hostUserId: input.hostUserId,
      hostEmail: input.hostEmail,
      hostName: input.hostName,
      partyName: input.partyName,
      partyDateTime: input.partyDateTime,
      partyLocation: input.partyLocation,
      shareToken: input.shareToken,
      hasCalendarSync: input.hasCalendarSync,
      scheduledReminders: reminders,
    });

    // Set alarm for the first reminder
    if (reminders.length > 0) {
      await this.ctx.storage.setAlarm(reminders[0].scheduledFor);
    }

    return { scheduled: reminders.length };
  }

  // Called when user connects/disconnects calendar
  async updateCalendarSync(hasCalendarSync: boolean): Promise<void> {
    const state = await this.getState();
    if (!state) return;

    if (hasCalendarSync) {
      // User connected calendar - cancel all email reminders
      await this.ctx.storage.deleteAlarm();
      state.scheduledReminders = [];
    }

    state.hasCalendarSync = hasCalendarSync;
    await this.setState(state);
  }

  // Called when alarm fires
  async alarm(): Promise<void> {
    const state = await this.getState();
    if (!state || state.hasCalendarSync) return;

    const now = Date.now();
    const dueReminders = state.scheduledReminders.filter(
      r => r.scheduledFor <= now + 60000 // Within 1 minute
    );

    if (dueReminders.length === 0) return;

    // Send reminder email
    for (const reminder of dueReminders) {
      await this.sendReminderEmail(state, reminder);
    }

    // Remove sent reminders and schedule next alarm
    state.scheduledReminders = state.scheduledReminders.filter(
      r => r.scheduledFor > now + 60000
    );
    await this.setState(state);

    // Set alarm for next reminder
    if (state.scheduledReminders.length > 0) {
      await this.ctx.storage.setAlarm(state.scheduledReminders[0].scheduledFor);
    }
  }

  private async sendReminderEmail(
    state: PartyReminderState,
    reminder: ScheduledReminder
  ): Promise<void> {
    const resendApiKey = this.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return;
    }

    const baseUrl = this.env.APP_URL || "https://chefde.party";
    const inviteUrl = `${baseUrl}/parties/${state.partyId}/timeline`;

    const partyDate = new Date(state.partyDateTime);
    const formattedDate = partyDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const formattedTime = partyDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    let subject: string;
    let preheader: string;

    switch (reminder.reminderType) {
      case "heads-up":
        subject = `Heads up: ${state.partyName} is in 2 days!`;
        preheader = `Time to start prepping - you have ${reminder.taskIds.length} tasks to get started on.`;
        break;
      case "day-before":
        subject = `Tomorrow: ${state.partyName} prep tasks`;
        preheader = `${reminder.taskIds.length} cooking tasks to complete before tomorrow's party.`;
        break;
      case "day-of":
        subject = `Today's the day! ${state.partyName} cooking tasks`;
        preheader = `Your party is today - here's what needs to be done.`;
        break;
    }

    const greeting = state.hostName ? `Hi ${state.hostName},` : "Hi,";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #000; font-size: 24px; margin-bottom: 10px;">${subject}</h1>
  </div>

  <p style="font-size: 16px; margin-bottom: 20px;">${greeting}</p>

  <p style="font-size: 16px; margin-bottom: 20px;">${preheader}</p>

  <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
    <p style="margin: 0 0 10px 0; font-size: 16px;">
      <strong>${state.partyName}</strong>
    </p>
    <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
      ${formattedDate} at ${formattedTime}
    </p>
    ${state.partyLocation ? `<p style="margin: 0; font-size: 14px; color: #666;">${state.partyLocation}</p>` : ""}
  </div>

  <p style="font-size: 16px; margin-bottom: 20px;">
    You have <strong>${reminder.taskIds.length} task${reminder.taskIds.length > 1 ? "s" : ""}</strong> to work on.
    Check your timeline for details.
  </p>

  <div style="text-align: center; margin-bottom: 30px;">
    <a href="${inviteUrl}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 500;">
      View Timeline
    </a>
  </div>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 12px; color: #999; text-align: center;">
    Sent via <a href="https://chefde.party" style="color: #999;">ChefDeParty</a><br>
    <a href="${baseUrl}/settings" style="color: #999;">Connect Google Calendar</a> to get reminders there instead.
  </p>
</body>
</html>
    `.trim();

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "ChefDeParty <hello@chefde.party>",
          to: state.hostEmail,
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Failed to send reminder email:", error);
      }
    } catch (err) {
      console.error("Error sending reminder email:", err);
    }
  }

  // Cancel all reminders (e.g., when party is deleted)
  async cancelReminders(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete("state");
    this.state = null;
  }

  // HTTP fetch handler for stub.fetch() calls
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/schedule" && request.method === "POST") {
        const input = await request.json() as Parameters<typeof this.scheduleReminders>[0];
        const result = await this.scheduleReminders(input);
        return Response.json(result);
      }

      if (path === "/cancel" && request.method === "POST") {
        await this.cancelReminders();
        return Response.json({ success: true });
      }

      if (path === "/status" && request.method === "GET") {
        const state = await this.getState();
        return Response.json({
          hasState: !!state,
          scheduledReminders: state?.scheduledReminders.length || 0,
          hasCalendarSync: state?.hasCalendarSync || false,
        });
      }

      if (path === "/calendar-sync" && request.method === "POST") {
        const { hasCalendarSync } = await request.json() as { hasCalendarSync: boolean };
        await this.updateCalendarSync(hasCalendarSync);
        return Response.json({ success: true });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error("DO fetch error:", err);
      return new Response("Internal error", { status: 500 });
    }
  }
}
