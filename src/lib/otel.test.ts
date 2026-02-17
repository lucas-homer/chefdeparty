import { describe, expect, it } from "vitest";
import { getLangfuseTelemetryTracer } from "./otel";

describe("otel langfuse bridge", () => {
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
});
