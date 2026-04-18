# Architecture Decision Records

**Summary**: One decision per file. Immutable. New decisions supersede old ones rather than editing them.

## Conventions

- File naming: `NNNN-kebab-slug.md` (zero-padded 4-digit number).
- Frontmatter is required: `adr`, `title`, `status`, `date`, `deciders`, `supersedes`.
- Status values: `proposed`, `accepted`, `superseded by NNNN`, `deprecated`.
- Every ADR cites a trigger — an incident, a commit, a PR, or a constraint. No ADRs for hypothetical decisions.

## Index

- [0001 — Cloudflare Workers + D1 + Hono stack](0001-cloudflare-workers-d1-hono.md)
- [0002 — Party wizard uses deterministic handlers for Steps 1–2](0002-wizard-deterministic-step-handlers.md)
- [0003 — CI/CD: staging on merge, production on release](0003-staging-on-merge-production-on-release.md)
- [0004 — Multi-provider auth: Google OAuth, email magic link, phone OTP](0004-multi-provider-auth.md)
- [0005 — Langfuse for AI observability](0005-langfuse-ai-observability.md)
