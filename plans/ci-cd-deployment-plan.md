# CI/CD Deployment Plan (GitHub Actions + Cloudflare Workers)

## Target behavior

- Pull requests to `main` run CI test suites before merge.
- Merging to `main` automatically deploys to staging at `https://staging.chefde.party`.
- Publishing a GitHub release automatically deploys to production at `https://chefde.party`.

## What was added in this branch

- `.github/workflows/deploy.yml`
  - `pull_request`:
    - Runs lint + unit tests + build.
    - Runs Playwright E2E suite (Chromium projects).
  - `push` to `main`:
    - Runs checks, then deploys Worker to `staging` environment.
    - Applies D1 migrations to staging database before deploy.
  - `release.published`:
    - Runs checks, then deploys Worker to `production` environment.
    - Applies D1 migrations to production database before deploy.
- `wrangler.toml`
  - Added `[env.staging]` with `APP_URL=https://staging.chefde.party`.
  - Added explicit staging D1 binding.
  - Added production `APP_URL=https://chefde.party`.
  - Added explicit production D1 binding.

## One-time setup checklist

1. Cloudflare DNS and routes
   - Create DNS record for `staging.chefde.party`.
   - Confirm Worker routes/domains for both environments:
     - Production: `chefde.party`
     - Staging: `staging.chefde.party`

2. Cloudflare D1
   - Create staging DB:
     - `wrangler d1 create chefdeparty-db-staging`
   - Ensure production DB exists:
     - `chefdeparty-db`
   - Confirm `wrangler.toml` D1 IDs match your Cloudflare account values for:
     - `env.staging.d1_databases`
     - `env.production.d1_databases`

3. GitHub repository environments
   - Create environment `staging`.
   - Create environment `production`.
   - Add environment secrets for both:
     - `CLOUDFLARE_API_TOKEN`
     - `CLOUDFLARE_ACCOUNT_ID`
     - `AUTH_SECRET`
     - `AUTH_GOOGLE_ID`
     - `AUTH_GOOGLE_SECRET`
     - `GOOGLE_GENERATIVE_AI_API_KEY`
     - `RESEND_API_KEY`
     - `ADMIN_EMAILS`
   - Optional secrets (if used):
     - `LANGFUSE_PUBLIC_KEY`
     - `LANGFUSE_SECRET_KEY`
     - `TAVILY_API_KEY`
     - `TWILIO_ACCOUNT_SID`
     - `TWILIO_AUTH_TOKEN`
     - `TWILIO_VERIFY_SERVICE_SID`
     - `TWILIO_PHONE_NUMBER`

4. GitHub branch protections (recommended)
   - Require PRs before merging to `main`.
   - Require status checks from this workflow to pass before merge.

## Google OAuth setup (production + staging)

You likely need an additional OAuth client for staging.

1. Existing production OAuth client
   - Authorized JavaScript origins:
     - `https://chefde.party`
   - Authorized redirect URIs:
     - `https://chefde.party/api/auth/callback/google`

2. New staging OAuth client (recommended)
   - Authorized JavaScript origins:
     - `https://staging.chefde.party`
   - Authorized redirect URIs:
     - `https://staging.chefde.party/api/auth/callback/google`

3. Save the staging client values into the `staging` GitHub environment secrets:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`

4. Keep production client values in the `production` environment secrets:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`

## Deployment flow after setup

1. Open PR to `main`.
2. GitHub Actions runs lint, unit tests, build, and E2E suites.
3. Merge PR.
4. `push` to `main` triggers automatic staging deploy.
5. Validate staging at `https://staging.chefde.party`.
6. Publish GitHub release.
7. `release.published` triggers automatic production deploy.
