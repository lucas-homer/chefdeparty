import { test as setup, expect } from "@playwright/test";
import { setAuthCookie } from "./helpers/auth";

const AUTH_STATE_FILE = "./e2e/fixtures/.auth-state.json";

/**
 * This setup test runs before all other tests.
 * It creates an authenticated session by setting the session cookie
 * and saves the storage state for other tests to reuse.
 */
setup("authenticate", async ({ context, page, baseURL }) => {
  // Set the authentication cookie using our pre-seeded session
  await setAuthCookie(context, { baseURL: baseURL || "http://localhost:8787" });

  // Navigate to verify the cookie works
  await page.goto("/parties");

  // Wait for authentication to be confirmed (should not redirect to login)
  await expect(page).not.toHaveURL(/\/login/);

  // Save the authenticated state for other tests to use
  await context.storageState({ path: AUTH_STATE_FILE });
});
