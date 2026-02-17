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
const MAX_STRING_LENGTH = 4000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 7;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeString(value: string, keyHint?: string): string {
  const looksLikeImageField = keyHint === "image" || keyHint === "imageUrl" || keyHint === "data";
  const looksLikeDataUrlImage =
    value.startsWith("data:image/") && value.includes(";base64,");

  if (looksLikeImageField && looksLikeDataUrlImage) {
    return `[omitted image data, ${value.length} chars]`;
  }

  if (value.length > MAX_STRING_LENGTH) {
    const truncatedChars = value.length - MAX_STRING_LENGTH;
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${truncatedChars} chars]`;
  }

  return value;
}

function sanitizeLangfuseValue(value: unknown, depth = 0, keyHint?: string): unknown {
  if (value == null) return value;

  if (depth > MAX_DEPTH) {
    return "[max depth reached]";
  }

  if (typeof value === "string") {
    return sanitizeString(value, keyHint);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const trimmed = value.slice(0, MAX_ARRAY_ITEMS);
    const sanitized = trimmed.map((item) => sanitizeLangfuseValue(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      sanitized.push(`[array truncated, ${value.length - MAX_ARRAY_ITEMS} items omitted]`);
    }
    return sanitized;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const trimmedEntries = entries.slice(0, MAX_OBJECT_KEYS);
    const sanitizedEntries = trimmedEntries.map(([key, item]) => [
      key,
      sanitizeLangfuseValue(item, depth + 1, key),
    ]);

    const sanitizedObject = Object.fromEntries(sanitizedEntries);
    if (entries.length > MAX_OBJECT_KEYS) {
      sanitizedObject.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
    }
    return sanitizedObject;
  }

  return String(value);
}

export function sanitizeLangfusePayload(payload: unknown): unknown {
  return sanitizeLangfuseValue(payload);
}

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
    input?: unknown;
    output?: unknown;
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
      input: sanitizeLangfusePayload(params.input),
      output: sanitizeLangfusePayload(params.output),
      metadata: {
        environment,
        ...(sanitizeLangfusePayload(params.metadata) as Record<string, unknown>),
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
      input: sanitizeLangfusePayload(params.input),
      metadata: {
        environment: getLangfuseEnvironmentName(env),
        ...(sanitizeLangfusePayload(params.metadata) as Record<string, unknown>),
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
    generation.update(sanitizeLangfusePayload(payload) as Record<string, unknown>);
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
    generation.end(sanitizeLangfusePayload(payload) as Record<string, unknown>);
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
