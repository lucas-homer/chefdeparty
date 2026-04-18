---
adr: 0001
title: Cloudflare Workers + D1 + Hono as the runtime stack
status: accepted
date: 2025-01-01
deciders: @lucas-homer
supersedes: none
---

# ADR 0001: Cloudflare Workers + D1 + Hono as the runtime stack

**Summary**: Ship the app on Cloudflare Workers with D1 (SQLite) for storage and Hono for routing + server rendering, instead of a Node/Next.js stack.

## Context

chefdeparty started as a Next.js app (see the deprecated files in `src/components/`) and was rewritten onto Cloudflare Workers. The rewrite was visible in commit `88e04fc` (Initial commit of the current tree) and is documented in the "Legacy Code" section of [../../CLAUDE.md](../../CLAUDE.md). The motivation was cost and operational simplicity for a personal project: no always-on Node server, a free/cheap managed SQLite (D1), and a single deploy surface.

## Decision

Use:

- **Cloudflare Workers** as the compute runtime (see `wrangler.toml`).
- **D1** as the primary database, with Drizzle ORM and SQL migrations in `drizzle/migrations/`.
- **Hono** as the HTTP framework (`src/index.ts` wires it up).
- **Vite-bundled React 19** for client-side hydration into server-rendered HTML (`client/`).
- **Durable Objects** (`src/durable-objects/party-reminder.ts`) for stateful scheduling.

Server pages are rendered through `src/routes/pages/layout.tsx` as JSX. Interactive islands hydrate from entries registered in `client/main.ts` and sibling files. The Workers Assets binding serves the Vite build.

## Alternatives considered

- **Stay on Next.js on Vercel** — higher cost, more moving parts (Postgres, cron service, image CDN), and the app doesn't need SSR streaming or Next's middleware model.
- **Node + SQLite + Fly/Render** — simpler mental model but requires managing a long-running process, disk, and a separate cron worker.
- **Hono on Node** — keeps Hono but loses the zero-config edge deployment and D1.

## Consequences

**Positive:**
- Low fixed cost; scales to zero.
- One deploy surface (`wrangler deploy`) covers compute, cron, and assets.
- D1 migrations via `wrangler d1 migrations apply` match the runtime.

**Negative:**
- Workers have CPU-time and subrequest limits; long AI calls require streaming and care (see the wizard handlers in `src/lib/party-wizard-handlers/`).
- D1 is eventually consistent across regions and lacks mature tooling compared to Postgres.
- Native Node APIs are limited — some libraries require `nodejs_compat` (`wrangler.toml`) or alternatives.

**Neutral:**
- The `src/components/` folder retains `@deprecated` Next.js remnants for reference; new code should not import from there.

## Related

- Code: `src/index.ts`, `wrangler.toml`, `drizzle/schema.ts`
- Onboarding: [../onboarding/week-one.md](../onboarding/week-one.md)
- Runbook: [../runbooks/deploy-production.md](../runbooks/deploy-production.md)
