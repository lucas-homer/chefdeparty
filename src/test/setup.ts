import { beforeAll, afterAll, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Skip MSW when running evals — evals need real API calls.
// EVALITE_REPORT_TRACES is set by evalite before vitest starts (run-vitest.js:15).
if (!process.env.EVALITE_REPORT_TRACES) {
  const { server } = await import("./mocks/server");

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
}
