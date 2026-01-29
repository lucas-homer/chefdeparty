import { Hono } from "hono";
import type { Env } from "@/index";
import type { Database } from "@/lib/db";
import { mockAuthMiddleware, testUsers, AuthUser } from "../mocks/auth";
import { createMockEnv } from "../mocks/env";

type Variables = {
  db: Database;
};

type AppContext = { Bindings: Env; Variables: Variables };

interface TestClientOptions {
  /** User to authenticate as. Pass null for unauthenticated requests. */
  user?: AuthUser | null;
  /** Database instance (for real database tests) */
  db?: Database;
  /** Environment overrides */
  env?: Partial<Env>;
}

/**
 * Creates a Hono test app wrapper that includes auth mocking and database setup.
 * Use this to test API routes in isolation.
 *
 * @example
 * import { createTestClient } from "@/test/helpers/hono-test-client";
 * import { partiesRoutes } from "@/routes/api/parties";
 *
 * describe("Parties API", () => {
 *   it("returns 401 for unauthenticated requests", async () => {
 *     const { app, request } = createTestClient({
 *       routes: partiesRoutes,
 *       user: null,
 *     });
 *
 *     const res = await request("/");
 *     expect(res.status).toBe(401);
 *   });
 *
 *   it("returns parties for authenticated user", async () => {
 *     const { request } = createTestClient({
 *       routes: partiesRoutes,
 *       user: testUsers.host,
 *     });
 *
 *     const res = await request("/");
 *     expect(res.status).toBe(200);
 *   });
 * });
 */
export function createTestClient<T extends Hono<AppContext>>(options: {
  routes: T;
} & TestClientOptions) {
  const { routes, user = testUsers.host, db, env = {} } = options;

  const mockEnv = createMockEnv(env);

  const app = new Hono<AppContext>()
    // Inject mock auth
    .use("*", mockAuthMiddleware(user))
    // Inject mock env and db into context
    .use("*", async (c, next) => {
      if (db) {
        c.set("db", db);
      }
      await next();
    })
    // Mount the routes being tested
    .route("/", routes);

  /**
   * Helper to make requests to the test app.
   */
  async function request(
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    const url = new URL(path, "http://localhost");
    const req = new Request(url.toString(), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init?.headers,
      },
    });
    return app.fetch(req, mockEnv);
  }

  /**
   * Helper for JSON POST requests.
   */
  async function post(path: string, body: unknown): Promise<Response> {
    return request(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Helper for JSON PUT requests.
   */
  async function put(path: string, body: unknown): Promise<Response> {
    return request(path, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  /**
   * Helper for JSON PATCH requests.
   */
  async function patch(path: string, body: unknown): Promise<Response> {
    return request(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  /**
   * Helper for DELETE requests.
   */
  async function del(path: string): Promise<Response> {
    return request(path, { method: "DELETE" });
  }

  return {
    app,
    request,
    post,
    put,
    patch,
    delete: del,
    env: mockEnv,
  };
}

/**
 * Re-export test users for convenience.
 */
export { testUsers };
