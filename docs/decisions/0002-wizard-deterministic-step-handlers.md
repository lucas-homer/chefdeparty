---
adr: 0002
title: Party wizard uses deterministic handlers for Steps 1–2
status: accepted
date: 2026-01-15
deciders: @lucas-homer
supersedes: none
---

# ADR 0002: Party wizard uses deterministic handlers for Steps 1–2

**Summary**: The party-creation wizard runs Steps 1 (party info) and 2 (guests) through deterministic code paths that call the LLM only for parsing user input, not for orchestration. Later steps remain LLM-driven.

## Context

Early versions of the wizard (commits `a45cabd`, `fbe79ea`) were fully LLM-orchestrated: the model decided when a step was complete, when to call tools, and when to advance. This produced flaky behavior — missed completions, duplicate guest writes, out-of-order step transitions — that the E2E suite kept catching. Commit `39329d7` ("Party Wizard: deterministic Step 1/2 flow + silent-completion resilience") and follow-ups `0b0bc99`, `5822cf7`, `52a2f94`, `918717f` made Steps 1–2 deterministic while keeping the chat affordance.

## Decision

Steps 1 (party info) and 2 (guests) are driven by code in `src/lib/party-wizard-deterministic/` and the corresponding handlers in `src/lib/party-wizard-handlers/`. The LLM is used for:

- Parsing free-form user input into structured fields (date, guest count, guest names/phones).
- Generating conversational follow-ups.

Step advancement, tool invocation, and database writes are owned by deterministic handlers. Parity tests (`src/lib/party-wizard-actions/parity.test.ts`) guard against regression.

Guest mutations are serialized through a wizard session lock (commit `e2684e8`) to prevent concurrent tool calls from losing updates.

Later steps (menu, timeline) remain LLM-driven for now because the surface of valid actions is larger and the cost of a bad transition is lower (a menu item can be edited in place).

## Alternatives considered

- **Stay fully LLM-driven** — simpler code but chronic reliability issues; the eval and E2E suites kept catching silent completions and duplicate writes.
- **Deterministic everything** — removes conversational flexibility in later steps where the user is iterating on menu ideas and timing; not worth the UX loss today.

## Consequences

**Positive:**
- Steps 1–2 are reliable enough to ship; E2E suite is stable.
- Clear boundary between "LLM as parser" and "code as orchestrator" that new steps can follow if they outgrow LLM orchestration.

**Negative:**
- Two code paths to maintain in the wizard (deterministic vs. handler) until the whole wizard is migrated or a unified model emerges.
- Intro messages, sidebars, and completion payloads need to stay in sync across both modes.

**Neutral:**
- The `WIZARD_STEP12_DETERMINISTIC_ENABLED` env flag exists on the Env interface (`src/index.ts`); the deterministic path is the default in production.

## Related

- Code: `src/lib/party-wizard-deterministic/`, `src/lib/party-wizard-handlers/`, `src/lib/party-wizard-actions/`
- Tests: `src/lib/party-wizard-actions/parity.test.ts`, `evals/party-info-agent.eval.ts`
- Commits: `39329d7`, `0b0bc99`, `e2684e8`
