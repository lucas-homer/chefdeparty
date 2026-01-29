import type { Context, MiddlewareHandler, Next } from "hono";

// Re-define AuthUser type locally to avoid circular import issues
export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

// Default test user
export const defaultTestUser: AuthUser = {
  id: "test-user-id",
  email: "test@example.com",
  name: "Test User",
  image: null,
};

// Preset test users
export const testUsers = {
  host: {
    id: "test-host-id",
    email: "host@test.com",
    name: "Test Host",
    image: null,
  } satisfies AuthUser,
  guest: {
    id: "test-guest-id",
    email: "guest@test.com",
    name: "Test Guest",
    image: null,
  } satisfies AuthUser,
  admin: {
    id: "test-admin-id",
    email: "admin@test.com",
    name: "Test Admin",
    image: null,
  } satisfies AuthUser,
};

/**
 * Creates a mock auth context object that can be set on the Hono context.
 * This mimics the structure that @hono/auth-js sets after successful authentication.
 */
export function createMockAuthContext(user: Partial<AuthUser> = {}) {
  const mergedUser = { ...defaultTestUser, ...user };
  return {
    session: {
      user: {
        id: mergedUser.id,
        email: mergedUser.email ?? undefined,
        name: mergedUser.name ?? undefined,
        image: mergedUser.image ?? undefined,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
    },
    token: "mock-session-token",
  };
}

/**
 * Middleware that mocks authentication by setting authUser on the context.
 * Use this in tests to bypass the actual auth flow.
 *
 * @example
 * // In a test file:
 * import { mockAuthMiddleware } from "@/test/mocks/auth";
 *
 * const app = new Hono()
 *   .use("*", mockAuthMiddleware(testUsers.host))
 *   .route("/api/parties", partiesRoutes);
 *
 * // Or with no user (unauthenticated):
 * .use("*", mockAuthMiddleware(null))
 */
export function mockAuthMiddleware(
  user?: AuthUser | null
): MiddlewareHandler<any> {
  return async (c, next) => {
    if (user) {
      (c as any).set("authUser", createMockAuthContext(user));
    } else {
      (c as any).set("authUser", { session: null, token: null });
    }
    await next();
  };
}

/**
 * Helper to set auth context directly on a context object.
 * Useful when you have an existing context and need to add auth.
 */
export function setMockAuth(c: Context<any>, user: AuthUser | null = defaultTestUser) {
  if (user) {
    (c as any).set("authUser", createMockAuthContext(user));
  } else {
    (c as any).set("authUser", { session: null, token: null });
  }
}
