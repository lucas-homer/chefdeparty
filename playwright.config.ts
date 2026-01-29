import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  // Global setup runs before all tests - seeds the database
  globalSetup: "./e2e/global-setup.ts",

  use: {
    baseURL: process.env.BASE_URL || "http://localhost:8787",
    trace: "on-first-retry",
  },

  projects: [
    // Setup project that runs first to authenticate
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      testIgnore: /\.(unauthenticated|public)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        // Use authenticated storage state for tests that need it
        storageState: "./e2e/fixtures/.auth-state.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "firefox",
      testIgnore: /\.(unauthenticated|public)\.spec\.ts/,
      use: {
        ...devices["Desktop Firefox"],
        storageState: "./e2e/fixtures/.auth-state.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "webkit",
      testIgnore: /\.(unauthenticated|public)\.spec\.ts/,
      use: {
        ...devices["Desktop Safari"],
        storageState: "./e2e/fixtures/.auth-state.json",
      },
      dependencies: ["setup"],
    },
    // Mobile viewports
    {
      name: "Mobile Chrome",
      testIgnore: /\.(unauthenticated|public)\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        storageState: "./e2e/fixtures/.auth-state.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "Mobile Safari",
      testIgnore: /\.(unauthenticated|public)\.spec\.ts/,
      use: {
        ...devices["iPhone 12"],
        storageState: "./e2e/fixtures/.auth-state.json",
      },
      dependencies: ["setup"],
    },
    // Unauthenticated project for login/public page tests
    {
      name: "chromium-unauthenticated",
      testMatch: /\.(unauthenticated|public)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Run local dev server before tests if not in CI
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:8787",
        reuseExistingServer: !process.env.CI,
        timeout: 120000, // 2 minutes for server startup
      },
});
