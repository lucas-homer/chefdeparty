# Runbooks

**Summary**: Operational playbooks for recurring tasks. Each carries a `last_verified` date — update it when you touch the file.

## Conventions

- Frontmatter is required: `runbook`, `last_verified`, `owner`, `on_call_relevant`.
- Steps include exact commands, not prose.
- Every runbook has a **Verification** section — "command exited 0" is not the same as "the thing is working."
- The lint flags runbooks older than 90 days. Re-verify and bump `last_verified`, or mark `STALE` and file an issue.

## Index

- [Deploy to production](deploy-production.md)
- [Apply a D1 migration](apply-d1-migration.md)
