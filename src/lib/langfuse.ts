import { Langfuse } from "langfuse";

// Langfuse client for production observability
// Only initialize if credentials are available
export const langfuse =
  process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
    ? new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com",
      })
    : null;

// Helper to create a trace for AI operations
export function createTrace(name: string, metadata?: Record<string, unknown>) {
  if (!langfuse) return null;

  return langfuse.trace({
    name,
    metadata,
  });
}

// Helper to create a span within a trace
export function createSpan(
  trace: ReturnType<typeof createTrace>,
  name: string,
  metadata?: Record<string, unknown>
) {
  if (!trace) return null;

  return trace.span({
    name,
    metadata,
  });
}

// Helper to create a generation span (for LLM calls)
export function createGeneration(
  trace: ReturnType<typeof createTrace>,
  name: string,
  input: unknown,
  model: string
) {
  if (!trace) return null;

  return trace.generation({
    name,
    input,
    model,
  });
}

// Shutdown helper for graceful termination
export async function shutdownLangfuse() {
  if (langfuse) {
    await langfuse.shutdownAsync();
  }
}
