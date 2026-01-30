import { test, expect } from "@playwright/test";
import { testParties, testContributionItems } from "./fixtures/seed-data";

/**
 * E2E tests for the contributions feature.
 * Tests both host management and guest claiming flows.
 */

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

    // Should show the seeded items - use first() since items might be duplicated across test runs
    await expect(page.getByText("Bottle of wine").first()).toBeVisible();
    await expect(page.getByText("Dessert").first()).toBeVisible();
    await expect(page.getByText("Chips and salsa").first()).toBeVisible();
  });

  test("should show claimed status for claimed items", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // The "Dessert" item is claimed by Alice
    await expect(page.getByText(/claimed by.*alice/i)).toBeVisible();
  });

  test("should add a new contribution item", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // Fill in the form
    await page.getByPlaceholder(/item name/i).fill("Sparkling water");
    await page.getByRole("button", { name: /add/i }).click();

    // Should redirect back and show the new item
    await expect(page).toHaveURL(new RegExp(`/parties/${testParties.upcoming.id}/contributions`));
    await expect(page.getByText("Sparkling water").first()).toBeVisible();
  });

  test("should delete a contribution item", async ({ page }) => {
    await page.goto(`/parties/${testParties.upcoming.id}/contributions`);

    // The contribution items are in a div.divide-y container
    // Each item row has: <div><div><p>description</p>...</div><form>...<button>Remove</button></form></div>
    // Find the form that contains a sibling with "Chips and salsa" text
    const removeForm = page.locator("form").filter({
      has: page.locator('input[name="_method"][value="DELETE"]'),
    }).filter({
      hasNot: page.locator("form"), // Exclude nested forms
    });

    // Count forms before clicking
    const formsBefore = await removeForm.count();

    // Click the last remove button (most recently added "Chips and salsa" might be at end)
    // We need to find the specific one. Let's use a different approach:
    // Find the item text, then find its parent row, then the form within
    const itemsContainer = page.locator(".divide-y");
    const chipsRow = itemsContainer.locator("> div").filter({ hasText: "Chips and salsa" }).first();
    await chipsRow.locator("button", { hasText: /remove/i }).click();

    // Should have one less item now
    await expect(page.getByText("Chips and salsa")).not.toBeVisible();
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

    // Should show the contribution items - the text should be visible
    await expect(page.getByText("Bottle of wine")).toBeVisible();
    await expect(page.getByText(/dessert/i).first()).toBeVisible();
    await expect(page.getByText("Chips and salsa")).toBeVisible();
  });

  test("should show claimed items as disabled", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // The "Dessert" item is claimed and should show "(claimed)"
    await expect(page.getByText(/dessert.*\(claimed\)/i)).toBeVisible();

    // The checkbox for dessert should be disabled
    // Find the checkbox by its value (the contribution item ID)
    const dessertCheckbox = page.locator(`input[type="checkbox"][value="${testContributionItems[1].id}"]`);
    await expect(dessertCheckbox).toBeDisabled();
  });

  test("should allow unclaimed items to be selected", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // The unclaimed item checkbox should be enabled
    const wineCheckbox = page.locator(`input[type="checkbox"][value="${testContributionItems[0].id}"]`);
    await expect(wineCheckbox).toBeEnabled();

    // Should be able to check it
    await wineCheckbox.check();
    await expect(wineCheckbox).toBeChecked();
  });

  test("should claim items when submitting RSVP", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Fill in the RSVP form using input names since labels aren't connected
    await page.locator('input[name="name"]').fill("Test Guest");
    await page.locator('input[name="email"]').fill("testguest@example.com");
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");

    // Claim a contribution item
    const wineCheckbox = page.locator(`input[type="checkbox"][value="${testContributionItems[0].id}"]`);
    await wineCheckbox.check();

    // Submit the form
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should redirect to thank you page
    await expect(page).toHaveURL(/\/invite\/.*\/thanks/);
  });
});
