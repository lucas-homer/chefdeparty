---
adr: 0005
title: Langfuse + OTel for AI observability
status: accepted
date: 2026-02-10
deciders: @lucas-homer
supersedes: none
---

# ADR 0005: Langfuse + OTel for AI observability

**Summary**: Trace AI SDK calls through OpenTelemetry into Langfuse so prompt regressions and provider errors surface without digging through Worker logs.

## Context

The party wizard's reliability problems (see [0002](0002-wizard-deterministic-step-handlers.md)) were hard to diagnose from Cloudflare Worker logs alone — the interesting failures were in tool-call arguments and provider responses, not in application control flow. Commits `cb1e60d` (first Langfuse wiring + deterministic evals) and `61d437a` ("wire Langfuse OTel tracer into AI SDK telemetry") moved tracing from ad-hoc logs to structured spans.

## Decision

- **OTel SDK** configured in `src/lib/otel.ts`; a Langfuse exporter from `@langfuse/otel` ships spans to Langfuse Cloud.
- **AI SDK telemetry**: every `generateText` / `streamText` call in `src/lib/ai.ts` and the wizard handlers passes `experimental_telemetry` with a `functionId` so traces are grouped by use case.
- **Evals**: Evalite suites (`evals/party-info-agent.eval.ts`, `evals/recipe-generation.eval.ts`) run against the same LLM codepaths and also report to Langfuse.
- **Secrets**: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, optional `LANGFUSE_BASE_URL` — set via `wrangler secret` (prod/staging) and `.dev.vars` (local).

## Alternatives considered

- **Cloudflare Workers Logs only** — searchable but lacks prompt/response grouping; was painful enough that it forced this ADR.
- **LangSmith / OpenAI tracing** — tied to a single provider; the app uses Anthropic, Google, and OpenAI models.
- **Helicone** — proxy-based, but that adds latency on the Worker's critical path.

## Consequences

**Positive:**
- AI failures are debuggable by tracing a single user interaction end-to-end.
- Evals and production share one observability pipeline.

**Negative:**
- OTel on Workers is new and occasionally fragile (nodejs_compat surface).
- Langfuse is a paid SaaS dependency; if it goes down, traces are lost but the app keeps serving.

## Related

- Code: `src/lib/otel.ts`, `src/lib/langfuse.ts`, `src/lib/ai.ts`
- Tests: `src/lib/otel.test.ts`, `src/lib/langfuse.test.ts`
- Evals: `evals/*.eval.ts`
