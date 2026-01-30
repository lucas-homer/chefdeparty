import { test, expect } from "@playwright/test";
import { testParties } from "./fixtures/seed-data";

/**
 * E2E tests for phone authentication features - AUTHENTICATED.
 * These tests run with a logged-in user (host).
 */

test.describe("Guest Dialog - Phone Support", () => {
  test("should show email/phone tabs in add guest dialog", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/guests`);

    // Click add guest button
    await page.getByRole("button", { name: /add guest/i }).click();

    // Wait for dialog to open
    await expect(page.getByRole("dialog")).toBeVisible();

    // Should show email and phone tabs in dialog
    await expect(page.getByRole("dialog").getByRole("button", { name: "Email" })).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Phone" })).toBeVisible();
  });

  test("should show consent checkbox when phone tab selected", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/guests`);

    // Click add guest button
    await page.getByRole("button", { name: /add guest/i }).click();

    // Wait for dialog to open
    await expect(page.getByRole("dialog")).toBeVisible();

    // Switch to phone tab
    await page.getByRole("dialog").getByRole("button", { name: "Phone" }).click();

    // Should show consent checkbox text
    await expect(page.getByText(/consent to receive sms/i)).toBeVisible();
  });

  test("should require consent checkbox for phone guests", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/guests`);

    // Click add guest button
    await page.getByRole("button", { name: /add guest/i }).click();

    // Wait for dialog to open
    await expect(page.getByRole("dialog")).toBeVisible();

    // Switch to phone tab
    await page.getByRole("dialog").getByRole("button", { name: "Phone" }).click();

    // Enter phone number (use valid format: area code 415, exchange 555)
    await page.getByRole("dialog").getByPlaceholder(/555.*1234/).fill("+14155551234");

    // Add Guest button should be disabled without consent
    const addButton = page.getByRole("dialog").getByRole("button", { name: /add guest/i });
    await expect(addButton).toBeDisabled();

    // Check the consent checkbox
    await page.getByRole("dialog").getByRole("checkbox").check();

    // Now button should be enabled
    await expect(addButton).toBeEnabled();
  });
});
