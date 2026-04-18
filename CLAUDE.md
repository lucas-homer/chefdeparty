# CLAUDE.md

**Summary**: chefdeparty is a Cloudflare Workers + D1 + Hono app for AI-assisted dinner party planning. This file is the map for agents working in the repo.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Knowledge layer

Before starting non-trivial work, consult:

- [`docs/architecture/overview.md`](docs/architecture/overview.md) — system shape and request lifecycle.
- [`docs/decisions/`](docs/decisions/) — ADRs. Read the relevant one before changing something it touches.
- [`docs/runbooks/`](docs/runbooks/) — deploy and migration playbooks.
- [`docs/onboarding/week-one.md`](docs/onboarding/week-one.md) — full bootstrap if you're new to the repo.
- [`AGENTS.md`](AGENTS.md) — authenticated UI iteration loop (use the seeded session, not real OAuth, by default).

Ephemeral material (not canonical): `plans/` for in-flight implementation plans, `.context/` for scratch notes.

## Commands

```bash
# Development
pnpm dev              # Start dev server (wrangler dev)
pnpm dev:client       # Watch and rebuild client assets

# Build & Deploy
pnpm build            # Build client + worker
pnpm deploy           # Build and deploy to Cloudflare

# Testing
pnpm test             # Run unit tests (vitest)
pnpm test:watch       # Run tests in watch mode
pnpm test:e2e         # Run E2E tests (playwright)
pnpm test:e2e:ui      # Run E2E tests with UI

# Database
pnpm db:migrate       # Apply migrations to local D1
pnpm db:migrate:prod  # Apply migrations to production D1
pnpm db:generate      # Generate new migration from schema changes
pnpm db:studio        # Open Drizzle Studio

# AI Evals
pnpm eval             # Run AI evaluations (evalite)
pnpm eval:watch       # Run evals in watch mode
```

## Architecture

**Runtime:** Cloudflare Workers with D1 (SQLite) database

**Server (`src/`):**
- `index.ts` - Hono app entry point, middleware setup, route mounting
- `routes/api/` - REST API handlers (parties, recipes, calendar, invite-codes)
- `routes/pages/` - Server-rendered HTML pages using JSX
- `lib/hono-auth.ts` - Auth.js integration with Google OAuth + magic link email
- `lib/ai.ts` - AI recipe generation using Vercel AI SDK
- `durable-objects/party-reminder.ts` - Scheduled reminder system

**Client (`client/`):**
- Vite-bundled React components for interactive features
- Hydrates into server-rendered pages
- `main.ts` - Main client entry point
- Individual feature files: `timeline.tsx`, `recipe-form.tsx`, `guest-dialog.tsx`, etc.

**Database (`drizzle/`):**
- `schema.ts` - Drizzle ORM schema definitions
- `migrations/` - SQL migration files
- Key tables: users, parties, recipes, guests, menu_items, timeline_tasks, invite_codes

## Key Patterns

**Authentication:** Uses `@hono/auth-js` with database sessions. Admin emails (from `ADMIN_EMAILS` env var) bypass invite code requirement. The `requireAuth` middleware protects routes.

**API Routes:** Each route file exports a Hono sub-app that gets mounted in `routes/api/index.ts`. Routes use Zod validation via `@hono/zod-validator`.

**Page Rendering:** Server renders full HTML pages via `src/routes/pages/layout.tsx`. Client React components hydrate specific interactive sections.

**Environment:** Secrets go in `.dev.vars` for local dev (gitignored). Production secrets set via `wrangler secret`.

## Development Methodology

**Test-Driven Development (TDD):** This project follows TDD practices. When implementing new features or fixing bugs:

1. **Write tests first** - Define expected behavior before writing implementation code
2. **Run tests to verify they fail** - Confirms the test is actually testing something
3. **Implement the minimum code** to make tests pass
4. **Refactor** while keeping tests green

For any code changes, ensure appropriate test coverage exists:
- Unit tests (`src/**/*.test.ts`) for business logic and utilities
- E2E tests (`e2e/`) for user-facing flows and critical paths

Never skip writing tests to "save time" - the test suite is the project's safety net.

## UI Guidelines

**Component Library:** Prefer shadcn-ui components for all UI work, whether server-rendered or client-side React. This ensures consistent styling and accessible, composable patterns.

## Local Development

**Dev URL:** Local development runs through a Cloudflare tunnel at `https://labs.lucashomer.com`. This is the URL that should be used for OAuth redirect URIs in Google Cloud Console for local testing.

Set `APP_URL=https://labs.lucashomer.com` in `.dev.vars` for local development.

## Legacy Code

Files in `src/components/` marked with `@deprecated` are from a previous Next.js implementation. They're kept for reference but not actively used - the app now uses Hono for server rendering. See [`docs/decisions/0001-cloudflare-workers-d1-hono.md`](docs/decisions/0001-cloudflare-workers-d1-hono.md).

## How to work in this repo

1. **Before making changes** — check [`docs/decisions/`](docs/decisions/) for relevant ADRs. If a decision is at stake, reference or supersede the ADR.
2. **After shipping non-trivial changes** — update the affected runbook, or write a new ADR if a decision was made.
3. **Before merging doc changes** — run `scripts/lint.sh` from the repo root.
