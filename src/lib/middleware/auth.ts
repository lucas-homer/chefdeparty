import { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { Env } from "../../index";
import { createDb, sessions, users } from "../db";
import { eq } from "drizzle-orm";

// Type for authenticated user
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

// Helper to get session token from cookie
function getSessionToken(c: Context): string | null {
  const cookies = c.req.header("cookie");
  if (!cookies) return null;

  // Auth.js uses "authjs.session-token" or "__Secure-authjs.session-token"
  const match = cookies.match(
    /(?:__Secure-)?authjs\.session-token=([^;]+)/
  );
  return match ? decodeURIComponent(match[1]) : null;
}

// Middleware to load user from session (optional auth)
export const loadUser = createMiddleware<{
  Bindings: Env;
  Variables: { user?: AuthUser; db: ReturnType<typeof createDb> };
}>(async (c, next) => {
  const sessionToken = getSessionToken(c);

  if (sessionToken) {
    const db = c.get("db");

    // Look up session and user
    const result = await db
      .select({
        sessionToken: sessions.sessionToken,
        userId: sessions.userId,
        expires: sessions.expires,
        user: {
          id: users.id,
          email: users.email,
          name: users.name,
          image: users.image,
        },
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.sessionToken, sessionToken))
      .limit(1);

    if (result.length > 0) {
      const session = result[0];

      // Check if session is expired
      if (session.expires && session.expires > new Date()) {
        c.set("user", session.user);
      }
    }
  }

  await next();
});

// Middleware to require authentication
export const requireAuth = createMiddleware<{
  Bindings: Env;
  Variables: { user?: AuthUser; db: ReturnType<typeof createDb> };
}>(async (c, next) => {
  const user = c.get("user");

  if (!user) {
    // Check if this is an API request or page request
    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    // Redirect to login for page requests
    return c.redirect("/login");
  }

  await next();
});

// Helper to get current user (throws if not authenticated)
export function getCurrentUser(c: Context<{ Variables: { user?: AuthUser } }>): AuthUser {
  const user = c.get("user");
  if (!user) {
    throw new Error("User not authenticated");
  }
  return user;
}
