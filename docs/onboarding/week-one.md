# Week One

**Summary**: Day-by-day bootstrap for a new engineer or fresh agent session. The goal is: environment running locally, mental model of the stack, and one small PR on the board.

## Day 1 — Environment

1. Clone and install:
   ```bash
   pnpm install
   ```
2. Copy `.env.example` to `.dev.vars` and fill in the secrets. At minimum you need: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `RESEND_API_KEY`, `APP_URL=https://labs.lucashomer.com`. Twilio vars are optional unless you're touching phone auth.
3. Apply local migrations:
   ```bash
   pnpm db:migrate
   ```
4. Start the dev server and the client watcher in two terminals:
   ```bash
   pnpm dev           # wrangler dev
   pnpm dev:client    # vite build --watch
   ```
5. Run the test suites once end-to-end so you know baseline green:
   ```bash
   pnpm test
   pnpm test:e2e
   ```
6. Visit the local app at `https://labs.lucashomer.com` (Cloudflare tunnel — see [../../CLAUDE.md](../../CLAUDE.md)) and sign in.

## Day 2 — Read

In this order:

1. [../../CLAUDE.md](../../CLAUDE.md) — the map.
2. [../architecture/overview.md](../architecture/overview.md) — system shape, request lifecycle, module layout.
3. [../../AGENTS.md](../../AGENTS.md) — the authenticated UI iteration loop (how to work visually in the browser safely).
4. The ADRs in [../decisions/](../decisions/), in numerical order — current-state decisions that shaped the code you'll read.
5. Skim these source files — they embody the project conventions:
   - `src/index.ts` — how middleware and routes fit together.
   - `src/lib/hono-auth.ts` — the auth model.
   - `src/lib/party-wizard-handlers/index.ts` — how a wizard step is structured.
   - `drizzle/schema.ts` — the full data model.

## Day 3 — Ship something small

Candidate first-PR targets (all low-risk, instructive):

- Fix a typo or tighten copy in `src/routes/pages/` or the wizard intro messages (`src/lib/party-wizard-intro-messages.ts`).
- Add a Vitest case to an existing `*.test.ts` that covers a missed edge case.
- Add an E2E assertion in `e2e/` that covers a flow you exercised on Day 1.

Follow the TDD loop in [../../CLAUDE.md](../../CLAUDE.md): write the test, see it fail, implement, see it pass.

## Key systems

- **Prod** — `https://chefde.party`. Cloudflare dashboard under `chefdeparty` Worker.
- **Staging** — `https://staging.chefde.party`. Deployed on merge to `main`.
- **Local tunnel** — `https://labs.lucashomer.com` (required for Google OAuth redirect URI).
- **Observability** — Langfuse (for AI traces; project owner: @lucas-homer).
- **Worker logs** — `wrangler tail` or the Cloudflare dashboard.

## Red flags — ask before doing

- **Migrations that drop or rename columns** — D1 has no transactional DDL; coordinate and take a snapshot first. See [../runbooks/apply-d1-migration.md](../runbooks/apply-d1-migration.md).
- **Changes under `src/lib/party-wizard-deterministic/`** — parity tests guard the wizard; run `pnpm test src/lib/party-wizard-actions/parity.test.ts` after any edit.
- **Anything touching `src/lib/hono-auth.ts`** — auth changes break session invariants silently; E2E with real OAuth before merging.
- **Force-pushing `main`** — don't.
- **Adding Next.js-era imports from `src/components/`** — that folder is deprecated; use `client/` instead.

## Where to ask

This is a solo personal project (see `CONTRIBUTING.md`). Owner: @lucas-homer. For agent sessions, the code + ADRs + runbooks are the source of truth; when they contradict, the code wins and the docs need an update.
