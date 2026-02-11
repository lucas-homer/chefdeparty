import { test, expect } from "@playwright/test";

test.describe("Login Page (Unauthenticated)", () => {
  test("should redirect root to login", async ({ page }) => {
    await page.goto("/");

    // Unauthenticated users are redirected to login
    await expect(page).toHaveURL("/login");
  });

  test("should display sign in heading", async ({ page }) => {
    await page.goto("/login");

    // Check for sign in heading
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("should display ChefDeParty branding", async ({ page }) => {
    await page.goto("/login");

    // Check for app name
    await expect(page.getByText(/ChefDeParty/)).toBeVisible();
  });

  test("should display Google sign in button", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });

  test("should display email sign in option", async ({ page }) => {
    await page.goto("/login");

    // Check for magic link email input
    await expect(page.getByPlaceholder(/email/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send magic link/i })
    ).toBeVisible();
  });

  test("should have invite code section", async ({ page }) => {
    await page.goto("/login");

    // Check for invite code toggle button
    await expect(
      page.getByRole("button", { name: /have an invite code/i })
    ).toBeVisible();
  });

  test("should render verify-request page without internal server error", async ({
    page,
  }) => {
    const response = await page.goto(
      "/api/auth/verify-request?provider=resend&type=email"
    );

    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).not.toContainText("Internal Server Error");
  });
});
