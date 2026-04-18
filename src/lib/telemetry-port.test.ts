import { describe, it, expect, vi } from "vitest";
import {
  createNoopAdapter,
  createRecordingAdapter,
  createLangfuseAdapter,
  type LangfuseAdapterDeps,
  type LangfuseAdapterContext,
} from "./telemetry-port";

function createMockDeps(): LangfuseAdapterDeps & {
  mockUpdate: ReturnType<typeof vi.fn>;
  mockEnd: ReturnType<typeof vi.fn>;
} {
  const mockUpdate = vi.fn();
  const mockEnd = vi.fn();
  return {
    mockUpdate,
    mockEnd,
    createGeneration: vi.fn().mockReturnValue({
      id: "gen-abc",
      update: mockUpdate,
      end: mockEnd,
    }),
    updateGeneration: vi.fn(),
    endGeneration: vi.fn(),
    updateTrace: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
    flushTelemetry: vi.fn().mockResolvedValue(undefined),
    getTracer: vi.fn().mockReturnValue({ name: "fake-tracer" }),
  };
}

describe("TelemetryPort", () => {
  describe("NoopAdapter", () => {
    it("all methods are callable without throwing", async () => {
      const adapter = createNoopAdapter();

      const handle = adapter.startGeneration({
        name: "test-gen",
        model: "test-model",
      });
      handle.update({ output: { foo: "bar" } });
      handle.end();

      expect(adapter.getTelemetrySettings("test-fn")).toBeUndefined();

      adapter.setTraceOutput({ result: "ok" });

      await expect(adapter.flush()).resolves.toBeUndefined();
    });
  });

  describe("RecordingAdapter", () => {
    it("captures generation lifecycle events in order", () => {
      const adapter = createRecordingAdapter();

      const handle = adapter.startGeneration({
        name: "gen-1",
        model: "test-model",
        input: { prompt: "hello" },
        metadata: { step: "party-info" },
      });
      handle.update({ output: { text: "response" }, usage: { tokens: 42 } });
      handle.end();

      expect(adapter.events).toEqual([
        {
          type: "generation-start",
          params: {
            name: "gen-1",
            model: "test-model",
            input: { prompt: "hello" },
            metadata: { step: "party-info" },
          },
        },
        {
          type: "generation-update",
          name: "gen-1",
          payload: { output: { text: "response" }, usage: { tokens: 42 } },
        },
        {
          type: "generation-end",
          name: "gen-1",
        },
      ]);
    });

    it("captures trace output events", () => {
      const adapter = createRecordingAdapter();

      adapter.setTraceOutput({ decisionPath: "model", retryAttempted: false });

      expect(adapter.events).toEqual([
        {
          type: "trace-output",
          output: { decisionPath: "model", retryAttempted: false },
        },
      ]);
    });

    it("returns telemetry settings with functionId and metadata", () => {
      const adapter = createRecordingAdapter();

      const settings = adapter.getTelemetrySettings("wizard.party-info.streamText", {
        retryAttempt: 1,
      });

      expect(settings).toMatchObject({
        isEnabled: true,
        functionId: "wizard.party-info.streamText",
        metadata: { retryAttempt: 1 },
      });
    });
  });

  describe("LangfuseAdapter", () => {
    const fakeEnv = { LANGFUSE_PUBLIC_KEY: "pk-test", LANGFUSE_SECRET_KEY: "sk-test" };

    const fakeCtx: LangfuseAdapterContext = {
      traceId: "trace-123",
      sessionId: "session-456",
      userId: "user-789",
      step: "party-info",
      environment: "test",
      traceClient: {
        id: "trace-123",
        update: vi.fn(),
      },
    };

    it("startGeneration delegates to deps.createGeneration and handle delegates update/end", () => {
      const deps = createMockDeps();
      const adapter = createLangfuseAdapter(fakeEnv, deps, fakeCtx);

      const handle = adapter.startGeneration({
        name: "test-gen",
        model: "gemini-2.5-flash",
        input: { prompt: "hello" },
        metadata: { step: "party-info" },
      });

      expect(deps.createGeneration).toHaveBeenCalledWith(
        fakeEnv,
        expect.objectContaining({
          traceId: "trace-123",
          name: "test-gen",
          model: "gemini-2.5-flash",
          input: { prompt: "hello" },
        })
      );

      handle.update({ output: { text: "hi" }, usage: { tokens: 10 } });
      expect(deps.updateGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ id: "gen-abc" }),
        { output: { text: "hi" }, usage: { tokens: 10 } }
      );

      handle.end();
      expect(deps.endGeneration).toHaveBeenCalledWith(
        expect.objectContaining({ id: "gen-abc" })
      );
    });

    it("startGeneration returns noopHandle when createGeneration returns null", () => {
      const deps = createMockDeps();
      (deps.createGeneration as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const adapter = createLangfuseAdapter(fakeEnv, deps, fakeCtx);
      const handle = adapter.startGeneration({ name: "test", model: "test" });

      // Should not throw
      handle.update({ output: {} });
      handle.end();

      // updateGeneration/endGeneration should NOT be called
      expect(deps.updateGeneration).not.toHaveBeenCalled();
      expect(deps.endGeneration).not.toHaveBeenCalled();
    });

    it("setTraceOutput delegates to deps.updateTrace", () => {
      const deps = createMockDeps();
      const adapter = createLangfuseAdapter(fakeEnv, deps, fakeCtx);

      adapter.setTraceOutput({ result: "ok" });

      expect(deps.updateTrace).toHaveBeenCalledWith(fakeCtx.traceClient, {
        output: { result: "ok" },
      });
    });

    it("getTelemetrySettings produces settings with tracer and trace metadata", () => {
      const deps = createMockDeps();
      const adapter = createLangfuseAdapter(fakeEnv, deps, fakeCtx);

      const settings = adapter.getTelemetrySettings("wizard.test.fn", {
        retryAttempt: 2,
      });

      expect(settings).toMatchObject({
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        tracer: { name: "fake-tracer" },
        functionId: "wizard.test.fn",
        metadata: expect.objectContaining({
          langfuseTraceId: "trace-123",
          wizardSessionId: "session-456",
          wizardStep: "party-info",
          environment: "test",
          retryAttempt: 2,
        }),
      });

      expect(deps.getTracer).toHaveBeenCalledWith(fakeEnv);
    });

    it("getTelemetrySettings returns undefined when no trace context", () => {
      const deps = createMockDeps();
      const adapter = createLangfuseAdapter(fakeEnv, deps);

      expect(adapter.getTelemetrySettings("test-fn")).toBeUndefined();
    });

    it("flush delegates to deps.flush and deps.flushTelemetry", async () => {
      const deps = createMockDeps();
      const adapter = createLangfuseAdapter(fakeEnv, deps, fakeCtx);

      await adapter.flush();

      expect(deps.flush).toHaveBeenCalledWith(fakeEnv);
      expect(deps.flushTelemetry).toHaveBeenCalled();
    });

    it("setTraceOutput is a no-op when no trace client", () => {
      const deps = createMockDeps();
      const adapter = createLangfuseAdapter(fakeEnv, deps); // no ctx

      adapter.setTraceOutput({ result: "ok" });

      // updateTrace called with undefined traceClient — the underlying function handles it
      expect(deps.updateTrace).toHaveBeenCalledWith(undefined, {
        output: { result: "ok" },
      });
    });
  });
});
