import { Context, Hono } from "hono";
import { authHandler, initAuthConfig, verifyAuth } from "@hono/auth-js";
import Google from "@auth/core/providers/google";
import ResendProvider from "@auth/core/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { createDb } from "./db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  pendingInvites,
  inviteCodes,
  inviteCodeUses,
} from "../../drizzle/schema";

// Environment type
interface Env {
  DB: D1Database;
  AUTH_SECRET: string;
  AUTH_GOOGLE_ID: string;
  AUTH_GOOGLE_SECRET: string;
  RESEND_API_KEY: string;
  APP_URL?: string;
  ADMIN_EMAILS?: string;
}

// Type for authenticated user in context
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

// Create Auth.js configuration for Hono
export function getAuthConfig(c: Context<{ Bindings: Env }>) {
  const db = createDb(c.env.DB);

  return {
    secret: c.env.AUTH_SECRET,
    trustHost: true,
    basePath: "/api/auth",
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: [
      ResendProvider({
        apiKey: c.env.RESEND_API_KEY,
        from: "ChefDeParty <noreply@chefde.party>",
        maxAge: 10 * 60, // 10 minutes
        async sendVerificationRequest({ identifier, url, provider }) {
          const resend = new Resend(c.env.RESEND_API_KEY);

          const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign in to ChefDeParty</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #000; font-size: 28px; margin-bottom: 10px;">Sign in to ChefDeParty</h1>
  </div>

  <p style="font-size: 16px; margin-bottom: 20px;">
    Click the button below to sign in to your account. This link will expire in 10 minutes.
  </p>

  <div style="text-align: center; margin-bottom: 30px;">
    <a href="${url}" style="display: inline-block; background-color: #000; color: #fff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 500;">
      Sign in to ChefDeParty
    </a>
  </div>

  <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
    Or copy this link: <a href="${url}" style="color: #666;">${url}</a>
  </p>

  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

  <p style="font-size: 12px; color: #999; text-align: center;">
    If you didn't request this email, you can safely ignore it.
  </p>

  <p style="font-size: 12px; color: #999; text-align: center;">
    <a href="https://chefde.party" style="color: #999;">ChefDeParty</a> - Plan your perfect dinner party
  </p>
</body>
</html>`.trim();

          const text = `
Sign in to ChefDeParty

Click the link below to sign in to your account. This link will expire in 10 minutes.

${url}

If you didn't request this email, you can safely ignore it.

---
ChefDeParty - Plan your perfect dinner party
https://chefde.party`.trim();

          await resend.emails.send({
            from: provider.from as string,
            to: identifier,
            subject: "Sign in to ChefDeParty",
            html,
            text,
          });
        },
      }),
      Google({
        clientId: c.env.AUTH_GOOGLE_ID,
        clientSecret: c.env.AUTH_GOOGLE_SECRET,
        // Basic login - just profile and email
        // Calendar access is requested separately via /api/calendar/connect
      }),
    ],
    session: {
      strategy: "database" as const,
    },
    pages: {
      signIn: "/login",
      signOut: "/",
      error: "/login",
    },
    callbacks: {
      async signIn({ user }: { user: any }) {
        // Check if user already exists (returning user)
        const [existingUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, user.email));

        if (existingUser) {
          // Returning user - always allow
          return true;
        }

        // Check if user is an admin - allow without invite code
        const adminEmails = c.env.ADMIN_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) || [];
        if (user.email && adminEmails.includes(user.email.toLowerCase())) {
          return true;
        }

        // New user - check for valid invite code in pending_invites
        const [pendingInvite] = await db
          .select()
          .from(pendingInvites)
          .where(eq(pendingInvites.email, user.email.toLowerCase()));

        if (!pendingInvite) {
          // No invite code provided - reject
          return "/login?error=InviteRequired";
        }

        // Validate the invite code
        const [inviteCode] = await db
          .select()
          .from(inviteCodes)
          .where(eq(inviteCodes.id, pendingInvite.inviteCodeId));

        if (!inviteCode) {
          return "/login?error=InvalidInviteCode";
        }

        // Check if code is expired
        if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
          return "/login?error=InviteCodeExpired";
        }

        // Check if code is used up (but allow the pending invite's own reservation)
        if (
          inviteCode.maxUses !== null &&
          inviteCode.usedCount !== null &&
          inviteCode.usedCount >= inviteCode.maxUses
        ) {
          return "/login?error=InviteCodeUsed";
        }

        // Don't increment here - signIn can be called multiple times during magic link flow
        // Increment happens in createUser event when user is actually created

        return true;
      },
      session({ session, user }: { session: any; user: any }) {
        if (session.user) {
          session.user.id = user.id;
        }
        return session;
      },
    },
    events: {
      async createUser({ user }: { user: any }) {
        // When a new user is created, record the invite code usage
        const [pendingInvite] = await db
          .select()
          .from(pendingInvites)
          .where(eq(pendingInvites.email, user.email.toLowerCase()));

        if (pendingInvite) {
          // Record the usage for audit trail
          await db.insert(inviteCodeUses).values({
            inviteCodeId: pendingInvite.inviteCodeId,
            userId: user.id,
          });

          // Increment usage count now that user is actually created
          const [inviteCode] = await db
            .select()
            .from(inviteCodes)
            .where(eq(inviteCodes.id, pendingInvite.inviteCodeId));

          if (inviteCode) {
            await db
              .update(inviteCodes)
              .set({ usedCount: (inviteCode.usedCount || 0) + 1 })
              .where(eq(inviteCodes.id, pendingInvite.inviteCodeId));
          }

          // Clean up the pending invite
          await db
            .delete(pendingInvites)
            .where(eq(pendingInvites.email, user.email.toLowerCase()));
        }
      },
    },
  };
}

// Create auth routes handler
export function createAuthRoutes() {
  const auth = new Hono<{ Bindings: Env }>();

  // Initialize auth config for all routes
  auth.use("*", initAuthConfig(getAuthConfig));

  // Handle all auth routes
  auth.use("/*", authHandler());

  return auth;
}

// Middleware to verify authentication and add user to context
export const authMiddleware = verifyAuth();

// Helper to get session from context
export async function getSession(c: Context<{ Bindings: Env }>) {
  const auth = c.get("authUser");
  return auth?.session || null;
}

// Helper to get user from context
export function getUser(c: Context<{ Bindings: Env }>): AuthUser | null {
  const auth = c.get("authUser");
  if (!auth?.session?.user) return null;
  return {
    id: auth.session.user.id,
    email: auth.session.user.email || null,
    name: auth.session.user.name || null,
    image: auth.session.user.image || null,
  };
}

// Middleware to require authentication
export async function requireAuth(
  c: Context<{ Bindings: Env }>,
  next: () => Promise<void>
) {
  const user = getUser(c);

  if (!user) {
    const accept = c.req.header("accept") || "";
    if (accept.includes("application/json")) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.redirect("/login");
  }

  await next();
}

// Type augmentation for Hono context
declare module "hono" {
  interface ContextVariableMap {
    authUser: {
      session: {
        user: {
          id: string;
          email?: string;
          name?: string;
          image?: string;
        };
        expires: string;
      } | null;
      token: string | null;
    };
  }
}
