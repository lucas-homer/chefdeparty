---
runbook: deploy-production
last_verified: 2026-04-17
owner: "@lucas-homer"
on_call_relevant: true
---

# Runbook: Deploy to production

**Summary**: Cut a GitHub release to deploy `main` to `chefde.party`. Staging auto-deploys on every merge; production is gated behind an explicit release.

## When to use

- Shipping a validated change from `main` (already deployed to `staging.chefde.party`) to production.
- After a migration has been applied to production D1 (see [apply-d1-migration.md](apply-d1-migration.md)).

## Prerequisites

- You are on `main` with no uncommitted changes.
- The change has been running on `staging.chefde.party` and has been manually smoke-tested.
- If the change includes a migration, `pnpm db:migrate:prod` has already been run (migrations are not applied by the deploy workflow).
- The `RELEASE_PAT` repo secret is still valid (the deploy only fires when the release is published by a PAT, not the default `GITHUB_TOKEN` — see [../decisions/0003-staging-on-merge-production-on-release.md](../decisions/0003-staging-on-merge-production-on-release.md)).

## Steps

1. Confirm staging is healthy.
   ```bash
   curl -s https://staging.chefde.party/health
   ```
   **Expected output:** `{"status":"ok","timestamp":"…"}`

2. Trigger the release-creation workflow from the GitHub UI (Actions → "Create Release" → Run workflow), or run the `gh` equivalent:
   ```bash
   gh workflow run create-release.yml
   ```

3. The `create-release.yml` workflow publishes a new GitHub release using the PAT. The `deploy.yml` workflow listens for `release.published` and runs `wrangler deploy` against the `production` environment.

4. Watch the deploy:
   ```bash
   gh run list --workflow=deploy.yml --limit 3
   gh run watch
   ```

## Verification

1. Health check:
   ```bash
   curl -s https://chefde.party/health
   ```
   **Expected output:** `{"status":"ok","timestamp":"…"}`

2. Load `https://chefde.party` in a browser. Sign in. Create a party or open an existing one. Confirm the new behavior.

3. Tail Worker logs for 1–2 minutes and look for spikes in 5xx:
   ```bash
   npx wrangler tail --env production --format pretty
   ```

4. Open the Langfuse dashboard and spot-check recent traces — see [../decisions/0005-langfuse-ai-observability.md](../decisions/0005-langfuse-ai-observability.md).

## Rollback

1. Identify the last good release tag:
   ```bash
   gh release list --limit 5
   ```

2. Re-deploy from that tag by re-running the `deploy.yml` workflow against the tag:
   ```bash
   gh workflow run deploy.yml --ref <last-good-tag>
   ```

3. If the regression is caused by a migration, you cannot rollback the migration automatically — D1 migrations are forward-only. Write a forward migration that restores the prior shape. Coordinate before running it.

## Related

- ADR: [../decisions/0003-staging-on-merge-production-on-release.md](../decisions/0003-staging-on-merge-production-on-release.md)
- Workflows: `.github/workflows/deploy.yml`, `.github/workflows/create-release.yml`
- Config: `wrangler.toml` (`[env.production]`)
