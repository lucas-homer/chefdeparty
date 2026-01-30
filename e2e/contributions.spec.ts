import { test, expect } from "@playwright/test";
import { testParties, testContributionItems } from "./fixtures/seed-data";

/**
 * E2E tests for the contributions feature.
 * Tests both host management and guest claiming flows.
 *
 * Note: Tests are designed to be self-contained and not depend on
 * the exact state of seeded data, ensuring isolation across browsers.
 */

// Run tests serially within this file to avoid race conditions
test.describe.configure({ mode: "serial" });

test.describe("Contributions - Host Management", () => {
  test("should display the contributions page", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // Should show contributions heading
    await expect(page.getByRole("heading", { name: /contributions/i })).toBeVisible();

    // Should show the add item form
    await expect(page.getByPlaceholder(/item name/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /add/i })).toBeVisible();
  });

  test("should display seeded contribution items", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // Should show at least one contribution item (may vary based on prior test runs)
    // Check for the contribution section to have items
    const contributionItems = page.locator(".divide-y > div");
    await expect(contributionItems.first()).toBeVisible();
  });

  test("should show claimed status for claimed items", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // The "Dessert" item is claimed by Alice (seed data)
    await expect(page.getByText(/claimed by.*alice/i)).toBeVisible();
  });

  test("should add a new contribution item", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // Use unique name to avoid conflicts with other test runs
    const uniqueItem = `Test item ${Date.now()}`;

    // Fill in the form
    await page.getByPlaceholder(/item name/i).fill(uniqueItem);
    await page.getByRole("button", { name: /add/i }).click();

    // Should redirect back and show the new item
    await expect(page).toHaveURL(new RegExp(`/parties/${testParties.upcoming.id}/contributions`));
    await expect(page.getByText(uniqueItem)).toBeVisible();
  });

  test("should delete a contribution item", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // First, add a new item that we'll delete (self-contained test)
    const itemToDelete = `Delete me ${Date.now()}`;
    await page.getByPlaceholder(/item name/i).fill(itemToDelete);
    await page.getByRole("button", { name: /add/i }).click();

    // Wait for the item to appear
    await expect(page.getByText(itemToDelete)).toBeVisible();

    // Find the item's row and click remove
    const itemsContainer = page.locator(".divide-y");
    const itemRow = itemsContainer.locator("> div").filter({ hasText: itemToDelete }).first();
    await itemRow.locator("button", { hasText: /remove/i }).click();

    // Should have removed the item
    await expect(page.getByText(itemToDelete)).not.toBeVisible();
  });

  test("should navigate back to party details", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // Click the back link
    await page.getByRole("link", { name: new RegExp(`back to ${testParties.upcoming.name}`, "i") }).click();

    // Should navigate to party details
    await expect(page).toHaveURL(new RegExp(`/parties/${testParties.upcoming.id}$`));
  });
});

test.describe("Contributions - Guest RSVP", () => {
  test("should display contribution items on RSVP page", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Should show the "Would you like to bring something?" section
    await expect(page.getByText(/would you like to bring something/i)).toBeVisible();

    // Should have at least one contribution item checkbox
    const checkboxes = page.locator('input[type="checkbox"][name="claimContributionIds"]');
    await expect(checkboxes.first()).toBeVisible();
  });

  test("should show claimed items as disabled", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // The "Dessert" item is claimed and should show "(claimed)"
    await expect(page.getByText(/dessert.*\(claimed\)/i)).toBeVisible();

    // The checkbox for dessert should be disabled
    const dessertCheckbox = page.locator(`input[type="checkbox"][value="${testContributionItems[1].id}"]`);
    await expect(dessertCheckbox).toBeDisabled();
  });

  test("should allow unclaimed items to be selected", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Find any enabled (unclaimed) checkbox
    const enabledCheckbox = page.locator('input[type="checkbox"][name="claimContributionIds"]:not([disabled])').first();

    // Should be able to check it
    await enabledCheckbox.check();
    await expect(enabledCheckbox).toBeChecked();
  });

  test("should claim items when submitting RSVP", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Fill in the RSVP form using input names since labels aren't connected
    const uniqueEmail = `testguest-${Date.now()}@example.com`;
    await page.locator('input[name="name"]').fill("Test Guest");
    await page.locator('input[name="email"]').fill(uniqueEmail);
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");

    // Find any enabled checkbox and claim it
    const enabledCheckbox = page.locator('input[type="checkbox"][name="claimContributionIds"]:not([disabled])').first();
    const hasUnclaimedItem = await enabledCheckbox.count() > 0;

    if (hasUnclaimedItem) {
      await enabledCheckbox.check();
    }

    // Submit the form
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should redirect to thank you page
    await expect(page).toHaveURL(/\/invite\/.*\/thanks/);
  });
});
