# Architecture Overview

**Summary**: chefdeparty is a Cloudflare Worker that serves JSX-rendered pages, hydrates Vite-bundled React islands, talks to D1 via Drizzle, and drives a multi-step AI wizard backed by Durable Objects and Langfuse tracing.

## Request lifecycle

```
Client ── HTTPS ──▶ Cloudflare Worker (src/index.ts)
                     │
                     ├── logger / secureHeaders / cors
                     ├── HTML-rewrite middleware (hashes /assets/* against Vite manifest)
                     ├── db middleware (creates Drizzle client per request)
                     ├── Auth.js initAuthConfig + verifyAuth (non-throwing)
                     │
                     ├── /api/auth/*     ── Auth.js routes (Google / email / phone OTP)
                     ├── /api/*          ── REST handlers in src/routes/api/
                     ├── /health         ── JSON heartbeat
                     ├── /assets/*       ── Workers Assets with explicit cache rules
                     └── /* (pages)      ── JSX pages in src/routes/pages/
                                            └── hydrate client islands from client/main.ts
```

Scheduled cron (daily at 03:00 UTC) fires `scheduled()` in `src/index.ts`, which currently cleans up stale pending invites.

Durable Object `PartyReminder` (`src/durable-objects/party-reminder.ts`) schedules per-party reminders via alarms.

## Server layout (`src/`)

- **`index.ts`** — Hono app, middleware, manifest-based asset path rewriting, `fetch` + `scheduled` exports.
- **`routes/api/`** — one sub-app per resource, mounted in `routes/api/index.ts`:
  - `parties.ts`, `recipes.ts`, `calendar.ts`, `invite-codes.ts`, `invite.ts`, `party-wizard.ts`, `phone-auth.ts`, `webhooks.ts`.
  - Zod validation via `@hono/zod-validator`.
- **`routes/pages/`** — `layout.tsx` (shared shell) and `index.tsx` (page routes). Server renders JSX to HTML; client islands hydrate.
- **`lib/`** — cross-cutting modules:
  - `hono-auth.ts` — Auth.js adapter, provider config, `requireAuth` middleware.
  - `ai.ts` — AI SDK wrappers with telemetry baked in.
  - `otel.ts`, `langfuse.ts` — observability glue (see [ADR 0005](../decisions/0005-langfuse-ai-observability.md)).
  - `party-wizard-*` — the multi-step wizard (see [ADR 0002](../decisions/0002-wizard-deterministic-step-handlers.md)).
    - `party-wizard-deterministic/` — code-driven Steps 1–2.
    - `party-wizard-handlers/` — all-step handlers (menu, timeline, etc.).
    - `party-wizard-actions/` — shared action builders + parity tests.
    - `party-wizard-prompts.ts`, `party-wizard-intro-messages.ts`, `party-wizard-tools.ts`.
  - `schemas.ts`, `wizard-schemas.ts` — Zod schemas shared by API and client.
  - `rewrite-html-response.ts` — streams HTML and swaps unhashed asset paths.
- **`durable-objects/party-reminder.ts`** — alarm-driven reminders.

## Client layout (`client/`)

Entry points are registered in `client/main.ts`. Each interactive feature is a React 19 island:

- `party-wizard/` — multi-step chat wizard (AI SDK `useChat` hook).
- `timeline.tsx`, `recipe-form.tsx`, `recipe-chat.tsx`, `import-recipe.tsx`, `calendar-card.tsx`, `share-link.tsx`, `user-menu.tsx`, `guest-dialog.tsx`, `menu-remove.tsx`.
- `components/` — shadcn-ui primitives.

The server emits `<div data-island="…">` markers; `client/main.ts` resolves them to a React root.

## Data layer (`drizzle/`)

- **`schema.ts`** — Drizzle ORM schema. Key tables: `users`, `accounts`, `sessions`, `verification_tokens`, `parties`, `recipes`, `guests`, `menu_items`, `timeline_tasks`, `invite_codes`, `wizard_sessions`.
- **`migrations/`** — numbered SQL files (`0000_…` through `0015_…`), applied via `wrangler d1 migrations apply`. See [../runbooks/apply-d1-migration.md](../runbooks/apply-d1-migration.md).
- **Two configs**: `drizzle.config.ts` (remote, for typegen) and `drizzle.config.local.ts` (local D1, for `db:generate` and `db:studio`).

## External services

| Service              | Purpose                              | Secret(s)                                      |
| -------------------- | ------------------------------------ | ---------------------------------------------- |
| Google OAuth         | Primary host sign-in                 | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`         |
| Resend               | Email magic link delivery            | `RESEND_API_KEY`                               |
| Twilio Verify        | Phone OTP sign-in                    | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`, `TWILIO_PHONE_NUMBER` |
| Google Generative AI | Wizard + recipe generation           | `GOOGLE_GENERATIVE_AI_API_KEY`                 |
| Anthropic, OpenAI    | Alternative AI providers via AI SDK  | provider keys (optional)                       |
| Langfuse             | LLM traces + evals                   | `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`   |

See `wrangler.toml` for the full secret list and deployment bindings.

## Environments

- **Local** — `pnpm dev` via `wrangler dev`; tunneled at `https://labs.lucashomer.com` (set `APP_URL` in `.dev.vars`). See [../../CLAUDE.md](../../CLAUDE.md).
- **Staging** — `staging.chefde.party`, deployed on merge to `main`.
- **Production** — `chefde.party`, deployed on GitHub release.

See [ADR 0003](../decisions/0003-staging-on-merge-production-on-release.md) and [../runbooks/deploy-production.md](../runbooks/deploy-production.md).

## Testing

- **Unit** — Vitest colocated next to source (`*.test.ts`). Includes wizard parity tests, Zod schema tests, phone formatting, auth-email rendering.
- **E2E** — Playwright in `e2e/`. Authenticated flows use seeded storage state (see `AGENTS.md`).
- **AI evals** — Evalite (`evals/`), run via `pnpm eval`; reports to Langfuse.

## Deprecated surface

`src/components/` contains Next.js-era components marked `@deprecated`. Not imported by current code. Do not add to this folder; prefer `client/` for new interactive UI or `src/routes/pages/` for new server-rendered markup. See [../../CLAUDE.md](../../CLAUDE.md).
