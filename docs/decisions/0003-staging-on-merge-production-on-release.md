---
adr: 0003
title: CI/CD — staging deploys on merge to main, production deploys on release
status: accepted
date: 2025-11-01
deciders: @lucas-homer
supersedes: none
---

# ADR 0003: CI/CD — staging deploys on merge to main, production deploys on release

**Summary**: Every merge to `main` deploys to `staging.chefde.party`; cutting a GitHub release deploys to `chefde.party`. A PAT (not the default `GITHUB_TOKEN`) triggers the prod deploy so the release event can cascade.

## Context

The project needed a low-friction way to validate changes in a real Cloudflare environment without each merge immediately touching production. Commits `7d552cd` ("Set up CI/CD with staging on merge and production on release"), `9da81ab` ("Use PAT for release publication to trigger prod deploy"), `7bd1c63` (observability wiring), and `5428275` (skip CI jobs for fork PRs) established the current flow.

## Decision

- **Staging** (`staging.chefde.party`): deployed from `main` on every push by `.github/workflows/deploy.yml`. Uses the `staging` wrangler environment and the staging D1 database.
- **Production** (`chefde.party`): deployed from a GitHub release by the same workflow. A separate `.github/workflows/create-release.yml` opens the release.
- **Release authorship**: the release must be created with a personal access token (PAT) rather than the default `GITHUB_TOKEN`, because releases published by the default token do not fire downstream workflow triggers.
- **Fork PRs**: CI jobs that need secrets are skipped for forks to avoid leaking deploy credentials.
- **Migrations**: applied via `pnpm db:migrate:staging` / `pnpm db:migrate:prod` — not automatic on deploy. See [../runbooks/apply-d1-migration.md](../runbooks/apply-d1-migration.md).

## Alternatives considered

- **Deploy directly to prod on merge** — too aggressive for a solo project with no feature flags.
- **Preview-per-PR deploys** — more infra than the workload justifies; staging is sufficient for manual smoke tests.
- **Use `GITHUB_TOKEN` for the release** — tried first; release publication does not trigger the deploy workflow in that mode.

## Consequences

**Positive:**
- Every merge gets a real staging URL; easy to hand off for visual QA.
- Production is a deliberate step (cutting a release), which matches the "measure twice" bias for a public-facing personal project.

**Negative:**
- A PAT has to be maintained as a repo secret; if it expires, releases silently stop deploying.
- Migrations run out-of-band from code deploys — the runbook matters.

## Related

- Workflows: `.github/workflows/deploy.yml`, `.github/workflows/create-release.yml`
- Runbook: [../runbooks/deploy-production.md](../runbooks/deploy-production.md)
- Plan: `plans/ci-cd-deployment-plan.md`
