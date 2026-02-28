import { beforeAll, afterAll, afterEach } from "vitest";
import { server } from "./mocks/server";
import "@testing-library/jest-dom/vitest";

// Polyfill browser globals that @auth/core expects during module loading.
// This prevents "Cannot read properties of undefined (reading 'navigator')"
// when route test files import modules that transitively depend on @hono/auth-js.
if (typeof globalThis.navigator === "undefined") {
  (globalThis as any).navigator = { userAgent: "node" };
}

// Start MSW server before all tests
beforeAll(() => {
  server.listen({
    onUnhandledRequest: "warn",
  });
});

// Reset handlers after each test (removes any runtime handlers)
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests
afterAll(() => {
  server.close();
});
