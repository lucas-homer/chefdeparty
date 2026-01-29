import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { calendarConnections } from "../../../drizzle/schema";
import { requireAuth, getUser } from "../../lib/hono-auth";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";
import {
  getCalendarAuthUrl,
  exchangeCodeForTokens,
  hasCalendarAccess,
} from "../../lib/calendar";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

// Chain routes for type inference
const calendarRoutes = new Hono<AppContext>()
  // GET /api/calendar/connect - Initiate Google Calendar OAuth
  .get("/connect", requireAuth, async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const clientId = c.env.AUTH_GOOGLE_ID;
    if (!clientId) {
      return c.json({ error: "Google OAuth not configured" }, 500);
    }

    // Build callback URL
    const origin = c.req.header("origin") || c.env.NEXT_PUBLIC_URL || "https://chefde.party";
    const redirectUri = `${origin}/api/calendar/callback`;

    // Use user ID as state for verification
    const state = btoa(
      JSON.stringify({ userId: user.id, timestamp: Date.now() })
    );

    const authUrl = getCalendarAuthUrl(clientId, redirectUri, state);

    return c.redirect(authUrl);
  })

  // GET /api/calendar/callback - Handle OAuth callback
  .get("/callback", requireAuth, async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.redirect("/login");
    }

    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    // Handle user denial or errors
    if (error) {
      console.error("Calendar OAuth error:", error);
      return c.redirect("/settings?error=calendar_denied");
    }

    if (!code || !state) {
      return c.redirect("/settings?error=calendar_invalid");
    }

    // Verify state
    try {
      const stateData = JSON.parse(atob(state));
      if (stateData.userId !== user.id) {
        return c.redirect("/settings?error=calendar_invalid");
      }
      // Check if state is not too old (5 minutes)
      if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
        return c.redirect("/settings?error=calendar_expired");
      }
    } catch {
      return c.redirect("/settings?error=calendar_invalid");
    }

    const clientId = c.env.AUTH_GOOGLE_ID;
    const clientSecret = c.env.AUTH_GOOGLE_SECRET;

    if (!clientId || !clientSecret) {
      return c.redirect("/settings?error=calendar_config");
    }

    const origin = c.req.header("origin") || c.env.NEXT_PUBLIC_URL || "https://chefde.party";
    const redirectUri = `${origin}/api/calendar/callback`;

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(
        code,
        clientId,
        clientSecret,
        redirectUri
      );

      if (!tokens.refresh_token) {
        console.error("No refresh token received");
        return c.redirect("/settings?error=calendar_no_refresh");
      }

      const db = c.get("db");
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Upsert calendar connection
      const existing = await db
        .select()
        .from(calendarConnections)
        .where(eq(calendarConnections.userId, user.id));

      if (existing.length > 0) {
        await db
          .update(calendarConnections)
          .set({
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresAt,
            scope: tokens.scope,
            updatedAt: new Date(),
          })
          .where(eq(calendarConnections.userId, user.id));
      } else {
        await db.insert(calendarConnections).values({
          userId: user.id,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt,
          scope: tokens.scope,
        });
      }

      return c.redirect("/settings?success=calendar_connected");
    } catch (err) {
      console.error("Calendar token exchange error:", err);
      return c.redirect("/settings?error=calendar_exchange");
    }
  })

  // POST /api/calendar/disconnect - Remove calendar connection
  .post("/disconnect", requireAuth, async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");

    await db
      .delete(calendarConnections)
      .where(eq(calendarConnections.userId, user.id));

    return c.json({ success: true });
  })

  // GET /api/calendar/status - Check calendar connection status
  .get("/status", requireAuth, async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");

    const [connection] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, user.id));

    if (!connection) {
      return c.json({
        connected: false,
        hasCalendarAccess: false,
      });
    }

    return c.json({
      connected: true,
      hasCalendarAccess: hasCalendarAccess(connection.scope),
      expiresAt: connection.expiresAt,
    });
  });

// Export type for client
export type CalendarRoutes = typeof calendarRoutes;
export { calendarRoutes };
