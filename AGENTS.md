# AGENTS.md

## Authenticated Frontend UI Iteration Loop

Use this loop for any UI work behind authentication.

1. Start local dev in two terminals:
   - `pnpm dev`
   - `pnpm dev:client`
2. Open the app with browser tooling and iterate visually as changes are made.
3. Use the existing E2E auth bypass by default (do not run real OAuth unless the task is auth-specific):
   - `e2e/auth.setup.ts` creates authenticated storage state.
   - `e2e/helpers/auth.ts` sets `authjs.session-token`.
   - `e2e/fixtures/seed-data.ts` provides seeded test user/session (for example `host@test.com`).
4. Make small, incremental UI edits.
5. Add or update frontend unit tests (Vitest) for the behavior changed in each increment.
6. Run targeted unit tests immediately after each increment.
7. Re-check the same flow visually in the browser (desktop and mobile when relevant).
8. Add or update focused Playwright E2E tests for critical authenticated flows and regressions.
9. Run targeted E2E tests, then run broader suites before handoff when changes are substantial.
10. In handoff notes, include:
   - what changed,
   - what was visually verified in-browser,
   - which test commands were run and their outcomes.

## Real Login vs Test Auth

- Default: use seeded session + storage state for speed and determinism.
- Use real login only when validating login UX, provider wiring, callback behavior, or session creation itself.
