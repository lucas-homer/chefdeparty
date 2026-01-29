import { beforeAll, afterAll, afterEach } from "vitest";
import { server } from "./mocks/server";
import "@testing-library/jest-dom/vitest";

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
