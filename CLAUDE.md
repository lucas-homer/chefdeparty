# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## UI Guidelines

**Component Library:** Prefer shadcn-ui components for all UI work, whether server-rendered or client-side React. This ensures consistent styling and accessible, composable patterns.

## Legacy Code

Files in `src/components/` marked with `@deprecated` are from a previous Next.js implementation. They're kept for reference but not actively used - the app now uses Hono for server rendering.
