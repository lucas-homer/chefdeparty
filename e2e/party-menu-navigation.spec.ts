import { execSync } from "child_process";
import { test, expect } from "@playwright/test";
import { testParties, testRecipes, testMenuItems } from "./fixtures/seed-data";

const partyId = testParties.upcoming.id;
const recipeId = testMenuItems[0].recipeId;
const recipeName = testRecipes[0].name;
const partyName = testParties.upcoming.name;
const menuItemId = testMenuItems[0].id;

/**
 * Ensure the seeded menu item row exists (another browser's destructive
 * test may have removed it from the shared DB).
 */
function ensureMenuItemSeeded() {
  const ts = Math.floor(Date.now() / 1000);
  const sql = `INSERT OR IGNORE INTO party_menu (id, party_id, recipe_id, scaled_servings, course, created_at) VALUES ('${menuItemId}', '${partyId}', '${recipeId}', 8, 'main', ${ts})`;
  try {
    execSync(`npx wrangler d1 execute DB --local --command="${sql}"`, {
      stdio: "pipe",
      cwd: process.cwd(),
    });
  } catch {
    // Best-effort
  }
}

test.describe("Party Menu Navigation", () => {
  // Tests must run in order since the last test removes the menu item.
  test.describe.configure({ mode: "serial" });

  test("menu item rows are links to recipe detail with partyId", async ({ page }) => {
    await page.goto(`/parties/${partyId}/menu`);

    const recipeLink = page.getByRole("link", { name: recipeName });
    await expect(recipeLink).toBeVisible();
    await expect(recipeLink).toHaveAttribute(
      "href",
      `/recipes/${recipeId}?partyId=${partyId}`
    );
  });

  test("recipe page with partyId shows back-to-menu link", async ({ page }) => {
    await page.goto(`/recipes/${recipeId}?partyId=${partyId}`);

    const backLink = page.getByRole("link", { name: `Back to ${partyName} menu` });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", `/parties/${partyId}/menu`);
  });

  test("recipe page without partyId shows back-to-recipes link", async ({ page }) => {
    await page.goto(`/recipes/${recipeId}`);

    const backLink = page.getByRole("link", { name: "Back to recipes" });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute("href", "/recipes");
  });

  test("clicking remove icon opens confirmation dialog", async ({ page }) => {
    ensureMenuItemSeeded();
    await page.goto(`/parties/${partyId}/menu`);

    const removeButton = page.getByRole("button", { name: `Remove ${recipeName}` });
    await expect(removeButton).toBeVisible();
    await removeButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Remove from menu?");
    await expect(dialog).toContainText(recipeName);
  });

  test("cancelling remove dialog keeps the item", async ({ page }) => {
    ensureMenuItemSeeded();
    await page.goto(`/parties/${partyId}/menu`);

    const removeButton = page.getByRole("button", { name: `Remove ${recipeName}` });
    await removeButton.click();

    const cancelButton = page.getByRole("dialog").getByRole("button", { name: "Cancel" });
    await cancelButton.click();

    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByRole("link", { name: recipeName })).toBeVisible();
  });

  // Only run the destructive test in chromium to avoid cross-browser DB races.
  test("confirming remove dialog removes the item", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Destructive test runs only in chromium");

    ensureMenuItemSeeded();
    await page.goto(`/parties/${partyId}/menu`);

    const removeButton = page.getByRole("button", { name: `Remove ${recipeName}` });
    await removeButton.click();

    const confirmButton = page.getByRole("dialog").getByRole("button", { name: "Remove" });
    await confirmButton.click();

    await page.waitForURL(`/parties/${partyId}/menu`);
    await expect(page.getByRole("link", { name: recipeName })).not.toBeVisible();

    // Re-insert the menu item so other browser projects aren't affected
    ensureMenuItemSeeded();
  });
});
