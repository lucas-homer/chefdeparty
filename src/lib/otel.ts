import { trace, type Tracer } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider } from "@opentelemetry/sdk-trace-base";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import type { Env } from "../index";
import { getLangfuseEnvironmentName } from "./langfuse";

type OTelBindings = Pick<
  Env,
  "LANGFUSE_PUBLIC_KEY" | "LANGFUSE_SECRET_KEY" | "LANGFUSE_BASE_URL" | "NODE_ENV" | "APP_URL"
>;

type OTelState = {
  tracer?: Tracer;
  provider?: BasicTracerProvider;
  initializationKey?: string;
};

const OTEL_STATE_KEY = "__chefdeparty_langfuse_otel_state__";

function getState(): OTelState {
  const globalRef = globalThis as typeof globalThis & Record<string, unknown>;
  const existing = globalRef[OTEL_STATE_KEY] as OTelState | undefined;
  if (existing) return existing;

  const state: OTelState = {};
  globalRef[OTEL_STATE_KEY] = state;
  return state;
}

function hasLangfuseCredentials(env: OTelBindings): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);
}

function getInitializationKey(env: OTelBindings): string {
  return [
    env.LANGFUSE_PUBLIC_KEY || "",
    env.LANGFUSE_SECRET_KEY || "",
    env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com",
    getLangfuseEnvironmentName(env),
  ].join(":");
}

export function getLangfuseTelemetryTracer(env: OTelBindings): Tracer | undefined {
  if (!hasLangfuseCredentials(env)) return undefined;

  const state = getState();
  const initializationKey = getInitializationKey(env);
  if (state.tracer && state.initializationKey === initializationKey) {
    return state.tracer;
  }

  const environment = getLangfuseEnvironmentName(env);
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      "service.name": "chefdeparty-worker",
      "deployment.environment": environment,
    }),
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com",
        environment,
        exportMode: "immediate",
      }),
    ],
  });

  const didRegisterGlobalProvider = trace.setGlobalTracerProvider(provider);
  if (!didRegisterGlobalProvider) {
    console.warn(
      "[otel] Global tracer provider already registered; using existing provider for AI telemetry"
    );
  }

  const tracer = trace.getTracer("chefdeparty.ai");
  state.provider = didRegisterGlobalProvider ? provider : undefined;
  state.tracer = tracer;
  state.initializationKey = initializationKey;
  return tracer;
}

export async function flushLangfuseTelemetry(): Promise<void> {
  const state = getState();
  if (!state.provider) return;

  try {
    await state.provider.forceFlush();
  } catch (error) {
    console.error("[otel] Failed to flush Langfuse telemetry spans:", error);
  }
}
