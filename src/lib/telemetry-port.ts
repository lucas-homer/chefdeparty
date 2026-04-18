/**
 * Telemetry Port — interface for observability side-effects in the wizard.
 *
 * Handlers and the AI runner depend on this interface, not on Langfuse directly.
 * Production uses LangfuseAdapter; tests use NoopAdapter or RecordingAdapter.
 */

// ============================================
// Interfaces
// ============================================

export interface GenerationHandle {
  update(payload: { output?: unknown; usage?: unknown }): void;
  end(): void;
}

export interface TelemetryPort {
  startGeneration(params: {
    name: string;
    model: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
  }): GenerationHandle;

  getTelemetrySettings(
    functionId: string,
    metadata?: Record<string, unknown>
  ): object | undefined;

  setTraceOutput(output: Record<string, unknown>): void;

  flush(): Promise<void>;
}

// ============================================
// Event types (used by RecordingAdapter)
// ============================================

export type TelemetryEvent =
  | {
      type: "generation-start";
      params: {
        name: string;
        model: string;
        input?: unknown;
        metadata?: Record<string, unknown>;
      };
    }
  | { type: "generation-update"; name: string; payload: { output?: unknown; usage?: unknown } }
  | { type: "generation-end"; name: string }
  | { type: "trace-output"; output: Record<string, unknown> };

// ============================================
// NoopAdapter
// ============================================

const noopHandle: GenerationHandle = {
  update() {},
  end() {},
};

export function createNoopAdapter(): TelemetryPort {
  return {
    startGeneration() {
      return noopHandle;
    },
    getTelemetrySettings() {
      return undefined;
    },
    setTraceOutput() {},
    async flush() {},
  };
}

// ============================================
// RecordingAdapter
// ============================================

export function createRecordingAdapter(): TelemetryPort & { events: TelemetryEvent[] } {
  const events: TelemetryEvent[] = [];

  return {
    events,

    startGeneration(params) {
      events.push({ type: "generation-start", params });
      const name = params.name;
      return {
        update(payload) {
          events.push({ type: "generation-update", name, payload });
        },
        end() {
          events.push({ type: "generation-end", name });
        },
      };
    },

    getTelemetrySettings(functionId, metadata) {
      return {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        functionId,
        metadata: metadata || {},
      };
    },

    setTraceOutput(output) {
      events.push({ type: "trace-output", output });
    },

    async flush() {},
  };
}

// ============================================
// LangfuseAdapter
// ============================================

/**
 * Dependencies injected from langfuse.ts and otel.ts.
 * The adapter never imports those modules directly — the route layer provides them.
 */
export interface LangfuseAdapterDeps {
  createGeneration: (
    env: unknown,
    params: {
      traceId?: string;
      name: string;
      model: string;
      input?: unknown;
      metadata?: Record<string, unknown>;
    }
  ) => { update: (p: Record<string, unknown>) => void; end: (p?: Record<string, unknown>) => void } | null;

  updateGeneration: (
    generation: { update: (p: Record<string, unknown>) => void } | null,
    payload: Record<string, unknown>
  ) => void;

  endGeneration: (
    generation: { end: (p?: Record<string, unknown>) => void } | null,
    payload?: Record<string, unknown>
  ) => void;

  updateTrace: (
    trace: { update: (p: Record<string, unknown>) => void } | null | undefined,
    payload: Record<string, unknown>
  ) => void;

  flush: (env: unknown) => Promise<void>;
  flushTelemetry: () => Promise<void>;
  getTracer: (env: unknown) => unknown;
}

export interface LangfuseAdapterContext {
  traceId?: string;
  sessionId?: string;
  userId?: string;
  step?: string;
  environment?: string;
  traceClient?: { id: string; update: (p: Record<string, unknown>) => void };
}

/**
 * Convenience factory: creates a LangfuseAdapter by importing the real
 * langfuse.ts / otel.ts functions. Use this at the route level where
 * those modules are available.
 */
export function createLangfuseAdapterFromModules(
  env: unknown,
  langfuse: {
    createLangfuseGeneration: LangfuseAdapterDeps["createGeneration"];
    updateLangfuseGeneration: LangfuseAdapterDeps["updateGeneration"];
    endLangfuseGeneration: LangfuseAdapterDeps["endGeneration"];
    updateLangfuseTrace: LangfuseAdapterDeps["updateTrace"];
    flushLangfuse: LangfuseAdapterDeps["flush"];
  },
  otel: {
    getLangfuseTelemetryTracer: LangfuseAdapterDeps["getTracer"];
    flushLangfuseTelemetry: LangfuseAdapterDeps["flushTelemetry"];
  },
  ctx?: LangfuseAdapterContext
): TelemetryPort {
  return createLangfuseAdapter(
    env,
    {
      createGeneration: langfuse.createLangfuseGeneration,
      updateGeneration: langfuse.updateLangfuseGeneration,
      endGeneration: langfuse.endLangfuseGeneration,
      updateTrace: langfuse.updateLangfuseTrace,
      flush: langfuse.flushLangfuse,
      flushTelemetry: otel.flushLangfuseTelemetry,
      getTracer: otel.getLangfuseTelemetryTracer,
    },
    ctx
  );
}

export function createLangfuseAdapter(
  env: unknown,
  deps: LangfuseAdapterDeps,
  ctx?: LangfuseAdapterContext
): TelemetryPort {
  return {
    startGeneration(params) {
      const generation = deps.createGeneration(env, {
        traceId: ctx?.traceId,
        name: params.name,
        model: params.model,
        input: params.input,
        metadata: params.metadata,
      });

      if (!generation) return noopHandle;

      return {
        update(payload) {
          deps.updateGeneration(generation, payload);
        },
        end() {
          deps.endGeneration(generation);
        },
      };
    },

    getTelemetrySettings(functionId, metadata) {
      if (!ctx?.traceId) return undefined;

      const cleanedMetadata: Record<string, string | number | boolean> = {};
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          if (value !== undefined) {
            cleanedMetadata[key] = value as string | number | boolean;
          }
        }
      }

      return {
        isEnabled: true,
        recordInputs: true,
        recordOutputs: true,
        tracer: deps.getTracer(env),
        functionId,
        metadata: {
          langfuseTraceId: ctx.traceId,
          wizardSessionId: ctx.sessionId,
          wizardStep: ctx.step,
          environment: ctx.environment,
          ...cleanedMetadata,
        },
      };
    },

    setTraceOutput(output) {
      deps.updateTrace(ctx?.traceClient, { output });
    },

    async flush() {
      await deps.flush(env);
      await deps.flushTelemetry();
    },
  };
}
