import { trace } from "@opentelemetry/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLangfuseTelemetryTracer } from "./otel";

describe("otel langfuse bridge", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { __chefdeparty_langfuse_otel_state__?: unknown }).__chefdeparty_langfuse_otel_state__ = undefined;
    vi.restoreAllMocks();
  });

  it("returns undefined when langfuse credentials are missing", () => {
    const tracer = getLangfuseTelemetryTracer({
      LANGFUSE_PUBLIC_KEY: undefined,
      LANGFUSE_SECRET_KEY: undefined,
      LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com",
      NODE_ENV: "test",
      APP_URL: "http://localhost:8787",
    });

    expect(tracer).toBeUndefined();
  });

  it("returns a cached tracer when credentials are present", () => {
    const env = {
      LANGFUSE_PUBLIC_KEY: "pk-lf-test",
      LANGFUSE_SECRET_KEY: "sk-lf-test",
      LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com",
      NODE_ENV: "test",
      APP_URL: "http://localhost:8787",
    };

    const tracerA = getLangfuseTelemetryTracer(env);
    const tracerB = getLangfuseTelemetryTracer(env);

    expect(tracerA).toBeDefined();
    expect(tracerB).toBe(tracerA);
  });

  it("does not cache a local provider when global registration is rejected", () => {
    const env = {
      LANGFUSE_PUBLIC_KEY: "pk-lf-test",
      LANGFUSE_SECRET_KEY: "sk-lf-test",
      LANGFUSE_BASE_URL: "https://us.cloud.langfuse.com",
      NODE_ENV: "test",
      APP_URL: "http://localhost:8787",
    };

    vi.spyOn(trace, "setGlobalTracerProvider").mockReturnValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const tracer = getLangfuseTelemetryTracer(env);
    expect(tracer).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[otel] Global tracer provider already registered; using existing provider for AI telemetry"
    );

    const state = (
      globalThis as typeof globalThis & {
        __chefdeparty_langfuse_otel_state__?: { provider?: unknown };
      }
    ).__chefdeparty_langfuse_otel_state__;

    expect(state?.provider).toBeUndefined();
  });
});
