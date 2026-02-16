import { Langfuse } from "langfuse";
import type { Env } from "../index";

type LangfuseBindings = Pick<
  Env,
  "LANGFUSE_PUBLIC_KEY" | "LANGFUSE_SECRET_KEY" | "LANGFUSE_BASE_URL" | "NODE_ENV" | "APP_URL"
>;

type LangfuseTraceClient = {
  id: string;
  update: (payload: Record<string, unknown>) => unknown;
};

type LangfuseGenerationClient = {
  id: string;
  update: (payload: Record<string, unknown>) => unknown;
  end: (payload?: Record<string, unknown>) => unknown;
};

const clientCache = new Map<string, Langfuse>();

function hasLangfuseCredentials(env: LangfuseBindings): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);
}

export function getLangfuseEnvironmentName(env: LangfuseBindings): string {
  const appUrl = env.APP_URL?.toLowerCase() || "";
  if (appUrl.includes("staging")) return "staging";
  if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) return "development";

  const nodeEnv = env.NODE_ENV?.toLowerCase();
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "development";
}

function getClientCacheKey(env: LangfuseBindings): string {
  const baseUrl = env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com";
  const environment = getLangfuseEnvironmentName(env);
  return `${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}:${baseUrl}:${environment}`;
}

export function getLangfuseClient(env: LangfuseBindings): Langfuse | null {
  if (!hasLangfuseCredentials(env)) return null;

  const key = getClientCacheKey(env);
  const existing = clientCache.get(key);
  if (existing) return existing;

  const client = new Langfuse({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com",
    environment: getLangfuseEnvironmentName(env),
  });

  clientCache.set(key, client);
  return client;
}

export function createLangfuseTrace(
  env: LangfuseBindings,
  params: {
    name: string;
    sessionId?: string;
    userId?: string;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }
): LangfuseTraceClient | null {
  const client = getLangfuseClient(env);
  if (!client) return null;

  try {
    const environment = getLangfuseEnvironmentName(env);
    const trace = client.trace({
      name: params.name,
      sessionId: params.sessionId,
      userId: params.userId,
      metadata: {
        environment,
        ...params.metadata,
      },
      tags: Array.from(new Set(["chefdeparty", `env:${environment}`, ...(params.tags || [])])),
    }) as unknown as LangfuseTraceClient;

    return trace;
  } catch (error) {
    console.error("[langfuse] Failed to create trace:", error);
    return null;
  }
}

export function createLangfuseGeneration(
  env: LangfuseBindings,
  params: {
    traceId?: string;
    name: string;
    model: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
  }
): LangfuseGenerationClient | null {
  if (!params.traceId) return null;

  const client = getLangfuseClient(env);
  if (!client) return null;

  try {
    const generation = client.generation({
      traceId: params.traceId,
      name: params.name,
      model: params.model,
      input: params.input,
      metadata: {
        environment: getLangfuseEnvironmentName(env),
        ...params.metadata,
      },
    }) as unknown as LangfuseGenerationClient;

    return generation;
  } catch (error) {
    console.error("[langfuse] Failed to create generation:", error);
    return null;
  }
}

export function updateLangfuseGeneration(
  generation: LangfuseGenerationClient | null,
  payload: Record<string, unknown>
): void {
  if (!generation) return;
  try {
    generation.update(payload);
  } catch (error) {
    console.error("[langfuse] Failed to update generation:", error);
  }
}

export function endLangfuseGeneration(
  generation: LangfuseGenerationClient | null,
  payload?: Record<string, unknown>
): void {
  if (!generation) return;
  try {
    generation.end(payload);
  } catch (error) {
    console.error("[langfuse] Failed to end generation:", error);
  }
}

export async function flushLangfuse(env: LangfuseBindings): Promise<void> {
  const client = getLangfuseClient(env);
  if (!client) return;
  try {
    await client.flushAsync();
  } catch (error) {
    console.error("[langfuse] Failed to flush traces:", error);
  }
}
