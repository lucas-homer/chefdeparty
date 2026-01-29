import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { createDb } from "./db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "../../drizzle/schema";

// Note: This is configured for Cloudflare Workers
// The D1 database binding is passed from the request context
export function createAuth(d1: D1Database) {
  const db = createDb(d1);

  return NextAuth({
    adapter: DrizzleAdapter(db, {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    providers: [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        // Basic login - just profile and email
        // Calendar access is requested separately via /api/calendar/connect
      }),
      // Email magic links will be added once we set up Cloudflare Email Workers
    ],
    session: {
      strategy: "database",
    },
    pages: {
      signIn: "/login",
      signOut: "/",
      error: "/login",
      verifyRequest: "/login/verify",
    },
    callbacks: {
      session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
        }
        return session;
      },
    },
    trustHost: true,
  });
}

// Type augmentation for session
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
