---
runbook: apply-d1-migration
last_verified: 2026-04-17
owner: "@lucas-homer"
on_call_relevant: false
---

# Runbook: Apply a D1 migration

**Summary**: Generate a new SQL migration from a schema change, apply it locally, then promote it to staging and production. D1 migrations are forward-only — there is no `down`.

## When to use

- You changed `drizzle/schema.ts` and need to propagate the change to D1.
- You are landing someone else's migration and need to apply it to staging/prod.

## Prerequisites

- `pnpm install` has been run.
- `.dev.vars` is configured and local dev has been run at least once (populates the local D1 shard).
- For remote steps: `wrangler login` with an account that has access to the `chefdeparty` Workers project.

## Steps

### 1. Generate the migration

```bash
pnpm db:generate
```

This uses `drizzle.config.local.ts` and writes a new file into `drizzle/migrations/NNNN_<slug>.sql`. Inspect the file — Drizzle's SQLite translator occasionally emits `ALTER TABLE` operations that SQLite does not support. Rewrite as `CREATE TABLE … INSERT … DROP … RENAME` if needed (see migrations `0010`, `0015` for prior precedent).

### 2. Apply locally

```bash
pnpm db:migrate
```

**Expected output:** `Migrations applied!`

### 3. Smoke-test locally

```bash
pnpm dev
```

Exercise the code path that depends on the new schema. Confirm no runtime errors and that Drizzle queries return the expected shape.

### 4. Apply to staging

```bash
pnpm db:migrate:staging
```

Deploy will happen automatically on next merge to `main`, but the migration has to land first or the deployed code will query a column that doesn't exist.

### 5. Verify on staging

```bash
curl -s https://staging.chefde.party/health
```

Sign into `https://staging.chefde.party` and exercise the new code path.

### 6. Apply to production

```bash
pnpm db:migrate:prod
```

Then cut the production release per [deploy-production.md](deploy-production.md).

## Verification

- Migration appears in the `d1_migrations` table on the target DB:
  ```bash
  npx wrangler d1 execute chefdeparty-db --remote --command "SELECT name, applied_at FROM d1_migrations ORDER BY applied_at DESC LIMIT 5"
  ```
- The code path exercising the new column/table works end-to-end in staging before prod migration is applied.

## Rollback

D1 migrations are forward-only. If a bad migration lands:

1. Write a new migration that reverses the bad one (e.g. drops the new column, or restores the dropped one from a known-good shape).
2. Coordinate with any in-flight writers — data dropped in step 1 is gone.
3. Apply the fix-forward migration via the same `db:migrate:prod` path.

If a migration fails partway (e.g. FK violation during `ALTER TABLE` rewrite — see commit `4b3fb3d`), D1 may leave the DB in a partially migrated state. Open the Cloudflare dashboard D1 console and inspect `d1_migrations` + the affected tables before re-running.

## Related

- ADR: [../decisions/0001-cloudflare-workers-d1-hono.md](../decisions/0001-cloudflare-workers-d1-hono.md), [../decisions/0004-multi-provider-auth.md](../decisions/0004-multi-provider-auth.md)
- Schema: `drizzle/schema.ts`
- Config: `drizzle.config.ts`, `drizzle.config.local.ts`
- History: commits `4b3fb3d`, `d6ad450`, `1d008e4` illustrate nullable-column migrations gone wrong.
