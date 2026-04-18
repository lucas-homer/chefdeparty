# docs/

**Summary**: Knowledge layer for chefdeparty. Agent-readable. Maintained alongside code.

## Structure

- [`decisions/`](decisions/) — ADRs. One decision per file. Immutable once merged.
- [`runbooks/`](runbooks/) — Operational playbooks. Dated; verified on touch.
- [`architecture/`](architecture/) — System design, data flow, boundaries.
- [`onboarding/`](onboarding/) — Week-one materials for new engineers and agent sessions.

## Conventions

- **Markdown only.** No Notion, Confluence, or Google Docs as primary source.
- **Summary line at top** of every substantive note: `**Summary**: <one sentence>`.
- **ISO dates** (`2026-04-17`), not "yesterday" or "last Thursday."
- **Relative paths** for internal references, not `https://github.com/...` URLs back into this repo.
- **ADRs are immutable.** To change a decision, write a new ADR that `supersedes` the old one.
- **Runbooks carry `last_verified`.** Update the date when you touch them.

## Maintenance

Run `scripts/lint.sh` from the repo root before merging doc changes. The lint catches broken links, orphans, stale runbooks, ADRs missing frontmatter, and substantive notes lacking a summary line.

Stale is worse than missing — if a runbook is wrong, mark it `STALE` and file an issue rather than leaving misleading steps.

## Where else to look

- `CLAUDE.md` (repo root) — the map for agents
- `AGENTS.md` (repo root) — authenticated UI iteration loop
- `plans/` — in-flight implementation plans (ephemeral, not ADRs)
- `.context/` — scratch notes (not canonical)
