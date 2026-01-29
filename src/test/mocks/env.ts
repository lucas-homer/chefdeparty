import type { Env } from "@/index";

/**
 * Mock Durable Object ID for testing.
 */
const createMockDurableObjectId = (idString: string) => ({
  toString: () => idString,
  equals: (other: any) => other?.toString?.() === idString,
  name: idString,
});

/**
 * Mock Durable Object namespace for testing.
 * Provides stub implementations for D.O. operations.
 */
const createMockDurableObjectNamespace = () => ({
  idFromName(name: string) {
    return createMockDurableObjectId(`mock-do-id-${name}`);
  },

  idFromString(hexId: string) {
    return createMockDurableObjectId(hexId);
  },

  newUniqueId() {
    const id = `mock-unique-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return createMockDurableObjectId(id);
  },

  get(_id: any) {
    return {
      id: createMockDurableObjectId("mock-stub-id"),
      name: "mock-stub",
      async fetch(_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
        return new Response(JSON.stringify({ scheduled: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    };
  },

  jurisdiction(_jurisdiction: any) {
    return this;
  },
});

/**
 * Mock D1Database for testing.
 * For actual database testing, use the in-memory database setup.
 */
const createMockD1Database = () => ({
  prepare(_query: string) {
    throw new Error(
      "MockD1Database.prepare() called. For database tests, use createTestDb() instead."
    );
  },

  dump(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  },

  batch<T = unknown>(_statements: any[]): Promise<any[]> {
    throw new Error("MockD1Database.batch() not implemented");
  },

  exec(_query: string): Promise<any> {
    throw new Error("MockD1Database.exec() not implemented");
  },
});

/**
 * Creates mock environment bindings for testing.
 * Use this when testing Hono routes that need access to env.
 *
 * @example
 * const app = new Hono<{ Bindings: Env }>()
 *   .use("*", (c, next) => {
 *     // Use mock env
 *     return next();
 *   });
 *
 * const res = await app.request("/", {}, createMockEnv());
 */
export function createMockEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createMockD1Database() as unknown as D1Database,
    PARTY_REMINDER: createMockDurableObjectNamespace() as unknown as DurableObjectNamespace,
    RESEND_API_KEY: "mock-resend-key",
    GOOGLE_GENERATIVE_AI_API_KEY: "mock-google-ai-key",
    AUTH_SECRET: "mock-auth-secret-at-least-32-chars-long",
    AUTH_GOOGLE_ID: "mock-google-client-id",
    AUTH_GOOGLE_SECRET: "mock-google-client-secret",
    LANGFUSE_PUBLIC_KEY: "mock-langfuse-public",
    LANGFUSE_SECRET_KEY: "mock-langfuse-secret",
    CRON_SECRET: "mock-cron-secret",
    APP_URL: "http://test.local",
    TAVILY_API_KEY: "mock-tavily-key",
    ADMIN_EMAILS: "admin@test.com",
    ...overrides,
  };
}
