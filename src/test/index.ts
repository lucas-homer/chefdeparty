/**
 * Test utilities barrel export.
 * Import from "@/test" for convenient access to all testing utilities.
 *
 * @example
 * import { testUsers, createTestClient, userFactory } from "@/test";
 */

// MSW mocking
export { server } from "./mocks/server";
export { handlers, mockData } from "./mocks/handlers";

// Auth mocking
export {
  mockAuthMiddleware,
  createMockAuthContext,
  setMockAuth,
  testUsers,
  defaultTestUser,
} from "./mocks/auth";

// Environment mocking
export { createMockEnv } from "./mocks/env";

// Test data factories
export {
  userFactory,
  presetUsers,
  partyFactory,
  recipeFactory,
  guestFactory,
  timelineTaskFactory,
} from "./factories";

// Test helpers
export { createTestClient } from "./helpers/hono-test-client";
export {
  customRender,
  mockFetchResponse,
  waitForAsync,
  userEvent,
  screen,
  fireEvent,
  waitFor,
  within,
} from "./helpers/render";
