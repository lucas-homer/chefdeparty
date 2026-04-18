---
adr: 0004
title: Multi-provider auth — Google OAuth, email magic link, phone OTP
status: accepted
date: 2025-09-15
deciders: @lucas-homer
supersedes: none
---

# ADR 0004: Multi-provider auth — Google OAuth, email magic link, phone OTP

**Summary**: Use `@hono/auth-js` (Auth.js) with three sign-in paths — Google OAuth, Resend-powered email magic link, and Twilio Verify phone OTP — backed by a D1-adapted Auth.js schema with nullable `email` and `phone` columns so either identifier alone is sufficient.

## Context

The product targets party hosts inviting guests who may not have email addresses they actively check. SMS-first invitations and sign-in were added (commits `2dc7207` dependencies, `eea84c4` schema, `478617e` API routes, `a49d102` guest invitations, `1d008e4` email NOT NULL fix) after email-only auth proved friction-heavy for guest flows. Commit `c41c1af` paused SMS invites for cost reasons but the phone sign-in path remained to keep existing users working. Commit `d6ad450` restored migration 0015 (users.email nullable) after a production FK failure on `4b3fb3d`.

## Decision

- Auth.js via `@hono/auth-js`, wired in `src/lib/hono-auth.ts`, with database sessions backed by D1.
- **Providers:**
  - Google OAuth (primary for hosts).
  - Email magic link via Resend (`src/lib/auth-email.ts`).
  - Phone OTP via Twilio Verify (`src/lib/phone.ts`, `src/routes/api/phone-auth.ts`).
- **Schema:** `users.email` and `users.phone` are both `TEXT UNIQUE` and nullable; `email_verified` and `phone_verified` track verification independently. See `drizzle/schema.ts` and migrations `0008`–`0015`.
- **Admin bypass:** emails listed in `ADMIN_EMAILS` skip the invite-code gate (`src/lib/admin.ts`).
- **Route protection:** a `requireAuth` middleware enforces authenticated access.

## Alternatives considered

- **Email-only (magic link)** — tried; guest flows with phone-only users required workarounds that were worse than a second provider.
- **Clerk / Stack Auth** — more features than needed; adds an external dependency and moves session storage out of D1.
- **Roll-your-own sessions** — Auth.js's adapter + middleware story is already solved; no reason to rebuild.

## Consequences

**Positive:**
- A single user row can attach Google + email + phone identities.
- Admin bypass keeps the invite-code gate simple without forking the auth path.

**Negative:**
- Nullable `email` and `phone` surfaces constraint-juggling in migrations (see `0010`, `0015`).
- Twilio Verify adds a paid dependency; SMS invites are currently paused to keep costs near zero (commit `c41c1af`).

**Neutral:**
- Invite-code gating lives in `src/routes/api/invite-codes.ts`; pending invites are cleaned up by a daily cron handler in `src/index.ts`.

## Related

- Code: `src/lib/hono-auth.ts`, `src/lib/auth-email.ts`, `src/lib/phone.ts`, `src/routes/api/phone-auth.ts`
- Schema: `drizzle/schema.ts`, migrations `0008_phone_auth.sql`, `0010_guest_email_nullable.sql`, `0015_users_email_nullable.sql`
- Tests: `src/lib/auth-email.test.ts`, `src/lib/phone.test.ts`, `e2e/phone-auth.spec.ts`
