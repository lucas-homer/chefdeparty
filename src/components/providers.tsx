/**
 * @deprecated NEXT.JS LEGACY CODE - Do not use
 * This component was used with Next.js App Router for session management.
 * The app now uses Hono with @hono/auth-js for authentication.
 * Kept for reference when building React client components that need session state.
 */
"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
