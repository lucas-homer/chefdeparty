import { test, expect } from "@playwright/test";
import { testUsers } from "./fixtures/seed-data";

/**
 * E2E tests for the user menu drawer.
 * The drawer should slide in from the right side of the screen.
 */
test.describe("User Menu Drawer", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/parties");
  });

  test("should open drawer when clicking user avatar", async ({ page }) => {
    // Click the user menu trigger (avatar button)
    await page.getByRole("button", { name: /user menu/i }).click();

    // The drawer should be visible (named after the user)
    const drawer = page.getByRole("dialog", { name: testUsers.host.name });
    await expect(drawer).toBeVisible();
  });

  test("should display user info in the drawer", async ({ page }) => {
    await page.getByRole("button", { name: /user menu/i }).click();

    const drawer = page.getByRole("dialog", { name: testUsers.host.name });
    await expect(drawer).toBeVisible();

    // Should show user name and email
    await expect(drawer.getByRole("heading", { name: testUsers.host.name })).toBeVisible();
    await expect(drawer.getByText(testUsers.host.email)).toBeVisible();
  });

  test("should have navigation links", async ({ page }) => {
    await page.getByRole("button", { name: /user menu/i }).click();

    const drawer = page.getByRole("dialog", { name: testUsers.host.name });

    // Navigation links should be present
    await expect(drawer.getByRole("link", { name: /parties/i })).toBeVisible();
    await expect(drawer.getByRole("link", { name: /recipes/i })).toBeVisible();
    await expect(drawer.getByRole("link", { name: /settings/i })).toBeVisible();
  });

  test("should have sign out button", async ({ page }) => {
    await page.getByRole("button", { name: /user menu/i }).click();

    const drawer = page.getByRole("dialog", { name: testUsers.host.name });
    await expect(drawer.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("should close drawer when clicking close button", async ({ page }) => {
    await page.getByRole("button", { name: /user menu/i }).click();

    const drawer = page.getByRole("dialog", { name: testUsers.host.name });
    await expect(drawer).toBeVisible();

    // Click the close button
    await drawer.getByRole("button", { name: /close/i }).click();

    // Drawer should be hidden
    await expect(drawer).not.toBeVisible();
  });

  test("should close drawer when pressing Escape", async ({ page }) => {
    await page.getByRole("button", { name: /user menu/i }).click();

    const drawer = page.getByRole("dialog", { name: testUsers.host.name });
    await expect(drawer).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // Drawer should be hidden
    await expect(drawer).not.toBeVisible();
  });

  test("should not cause horizontal overflow", async ({ page }) => {
    await page.getByRole("button", { name: /user menu/i }).click();

    // Wait for drawer animation
    await page.waitForTimeout(300);

    // Check that there's no horizontal scrollbar
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test("drawer should slide in from the right", async ({ page }) => {
    await page.getByRole("button", { name: /user menu/i }).click();

    const drawer = page.getByRole("dialog", { name: testUsers.host.name });
    await expect(drawer).toBeVisible();

    // The drawer content should be positioned on the right side
    const box = await drawer.boundingBox();

    if (box) {
      const viewportSize = page.viewportSize();
      // Drawer should be on the right side (its right edge should be at viewport edge)
      expect(box.x + box.width).toBeGreaterThan((viewportSize?.width || 1024) - 50);
    }
  });
});
