import { test, expect } from "@playwright/test";
import { testParties } from "./fixtures/seed-data";

/**
 * Authenticated tests for the parties page.
 * These tests use the pre-authenticated storage state from auth.setup.ts.
 */
test.describe("Parties Page (Authenticated)", () => {
  test("should display the parties list", async ({ page }) => {
    await page.goto("/parties");

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // Should show the parties page heading
    await expect(page.getByRole("heading", { name: /your parties/i })).toBeVisible();
  });

  test("should display seeded test party", async ({ page }) => {
    await page.goto("/parties");

    // The seeded party should be visible (use heading role to be specific)
    await expect(page.getByRole("heading", { name: testParties.upcoming.name })).toBeVisible();
  });

  test("should navigate to party details", async ({ page }) => {
    await page.goto("/parties");

    // Click on the party card (use the heading)
    await page.getByRole("heading", { name: testParties.upcoming.name }).click();

    // Should navigate to party details page
    await expect(page).toHaveURL(new RegExp(`/parties/${testParties.upcoming.id}`));
  });

  test("should show create party form", async ({ page }) => {
    await page.goto("/parties/new");

    // Should show the create party form heading
    await expect(page.getByRole("heading", { name: /create new party/i })).toBeVisible();

    // Should have party name input (find by placeholder or nearby label text)
    await expect(page.getByPlaceholder(/my dinner party/i)).toBeVisible();

    // Should have date/time input
    await expect(page.locator('input[type="datetime-local"]')).toBeVisible();
  });
});

test.describe("Party Details (Authenticated)", () => {
  test("should display party information", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}`);

    // Should show party name as heading
    await expect(page.getByRole("heading", { name: testParties.upcoming.name })).toBeVisible();

    // Should show navigation cards for guests, menu, timeline
    await expect(page.getByRole("link", { name: /guests/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /menu/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /timeline/i })).toBeVisible();
  });

  test("should display party guests", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/guests`);

    // Should show the seeded guests (using first() to avoid strict mode errors)
    await expect(page.getByText("Alice").first()).toBeVisible();
    await expect(page.getByText("Bob").first()).toBeVisible();
  });
});
