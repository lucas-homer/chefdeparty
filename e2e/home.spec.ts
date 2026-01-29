import { test, expect } from "@playwright/test";

test.describe("Home Page", () => {
  test("should display the landing page", async ({ page }) => {
    await page.goto("/");

    // Check for main heading
    await expect(
      page.getByRole("heading", { name: /dinner party/i })
    ).toBeVisible();

    // Check for CTA buttons
    await expect(page.getByRole("link", { name: /start planning/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
  });

  test("should navigate to login page", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /log in/i }).click();

    await expect(page).toHaveURL("/login");
    await expect(
      page.getByRole("heading", { name: /welcome back/i })
    ).toBeVisible();
  });

  test("should display feature cards", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/guest management/i)).toBeVisible();
    await expect(page.getByText(/smart recipes/i)).toBeVisible();
    await expect(page.getByText(/cooking timeline/i)).toBeVisible();
  });
});

test.describe("Authentication", () => {
  test("should display Google sign in button on login page", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });
});
