import { Page, BrowserContext } from "@playwright/test";
import { TEST_SESSION_TOKEN, testUsers } from "../fixtures/seed-data";

/**
 * Cookie name used by Auth.js for session management.
 * This matches the default cookie name used by @hono/auth-js.
 */
const AUTH_COOKIE_NAME = "authjs.session-token";

/**
 * Sets the authentication session cookie directly on the browser context.
 * This bypasses the actual OAuth flow for E2E tests.
 *
 * @example
 * test("authenticated user can see parties", async ({ page, context }) => {
 *   await setAuthCookie(context);
 *   await page.goto("/parties");
 *   // User is now authenticated as testUsers.host
 * });
 */
export async function setAuthCookie(
  context: BrowserContext,
  options: {
    sessionToken?: string;
    baseURL?: string;
  } = {}
): Promise<void> {
  const { sessionToken = TEST_SESSION_TOKEN, baseURL = "http://localhost:8787" } =
    options;

  const url = new URL(baseURL);

  await context.addCookies([
    {
      name: AUTH_COOKIE_NAME,
      value: sessionToken,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
      expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days
    },
  ]);
}

/**
 * Clears the authentication cookie from the browser context.
 * Use this to test logged-out states after being authenticated.
 */
export async function clearAuthCookie(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies();
  const authCookie = cookies.find((c) => c.name === AUTH_COOKIE_NAME);

  if (authCookie) {
    await context.clearCookies({ name: AUTH_COOKIE_NAME });
  }
}

/**
 * Checks if the current page shows the user as authenticated.
 * Useful for verifying auth state in tests.
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  // Try to access a protected route and see if we get redirected
  const response = await page.request.get("/api/parties", {
    headers: { Accept: "application/json" },
  });

  return response.status() === 200;
}

/**
 * Gets the current user info from the session.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(
  page: Page
): Promise<{ id: string; email: string; name: string } | null> {
  const response = await page.request.get("/api/auth/session", {
    headers: { Accept: "application/json" },
  });

  if (response.status() !== 200) {
    return null;
  }

  const session = await response.json();
  return session?.user || null;
}

/**
 * Re-export test users for convenience in tests.
 */
export { testUsers };
