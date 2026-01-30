import { test, expect } from "@playwright/test";
import { testParties } from "./fixtures/seed-data";

/**
 * E2E tests for phone authentication features - UNAUTHENTICATED.
 * These tests run without a logged-in user.
 */

test.describe("Login Page - Phone Auth UI", () => {
  test("should display phone tab on login page", async ({ page }) => {
    await page.goto("/login");

    // Should have Email and Phone tabs (using data-tab attribute)
    await expect(page.locator('button.tab[data-tab="email"]')).toBeVisible();
    await expect(page.locator('button.tab[data-tab="phone"]')).toBeVisible();
  });

  test("should show email form by default", async ({ page }) => {
    await page.goto("/login");

    // Email tab should be active by default
    await expect(page.locator('#email-tab')).toBeVisible();
    await expect(page.getByPlaceholder(/email/i).first()).toBeVisible();
  });

  test("should switch to phone form when phone tab clicked", async ({ page }) => {
    await page.goto("/login");

    // Click phone tab and wait for it to become active
    await page.locator('button.tab[data-tab="phone"]').click();

    // Wait for phone tab to have active class (becomes visible)
    await expect(page.locator('#phone-tab.active')).toBeVisible();
    // Phone input has placeholder +1 (555) 555-1234
    await expect(page.locator('#phone-tab').getByPlaceholder(/555.*1234/)).toBeVisible();
  });

  test("should show invite code field when toggled", async ({ page }) => {
    await page.goto("/login");

    // Click phone tab first and wait
    await page.locator('button.tab[data-tab="phone"]').click();
    await expect(page.locator('#phone-tab.active')).toBeVisible();

    // Click "First time here? I have an invite code" (in the phone tab) to show invite code field
    await page.locator('#phone-tab').getByText(/have an invite code/i).click();

    // Should show invite code input
    await expect(page.locator('#phone-invite-code')).toBeVisible();
  });

  test("should accept phone number input", async ({ page }) => {
    await page.goto("/login");

    // Switch to phone tab and wait
    await page.locator('button.tab[data-tab="phone"]').click();
    await expect(page.locator('#phone-tab.active')).toBeVisible();

    // Enter a phone number (use valid format: area code 415, exchange 555)
    // Phone input has placeholder +1 (555) 555-1234
    const phoneInput = page.locator('#phone-tab').getByPlaceholder(/555.*1234/);
    await phoneInput.fill("+1 415 555 1234");

    // Verify input value
    await expect(phoneInput).toHaveValue("+1 415 555 1234");
  });
});

test.describe("RSVP - Phone Number Support (Public)", () => {
  test("should display phone field on RSVP form", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Should show phone input field with placeholder
    await expect(page.locator('input[name="phone"]')).toBeVisible();
    await expect(page.getByPlaceholder(/555.*1234/)).toBeVisible();
  });

  test("should show helper text about email or phone", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Should show text indicating email or phone is needed
    await expect(page.getByText(/either email or phone/i)).toBeVisible();
  });

  test("should allow RSVP with phone only", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Fill in the RSVP form with phone instead of email
    // Use valid phone number format (area code 415, exchange 555)
    await page.locator('input[name="name"]').fill("Phone Test Guest");
    await page.locator('input[name="phone"]').fill("+14155551234");
    // Leave email empty
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");

    // Submit the form and wait for navigation
    await Promise.all([
      page.waitForURL(/\/invite\/.*\/thanks/),
      page.getByRole("button", { name: /submit rsvp/i }).click(),
    ]);

    // Should be on thank you page
    await expect(page).toHaveURL(/\/invite\/.*\/thanks/);
  });

  test("should allow RSVP with both email and phone", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);

    // Fill in the RSVP form with both
    await page.locator('input[name="name"]').fill("Both Contact Guest");
    await page.locator('input[name="email"]').fill("both@example.com");
    await page.locator('input[name="phone"]').fill("+14155559876");
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");

    // Submit the form
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should redirect to thank you page
    await expect(page).toHaveURL(/\/invite\/.*\/thanks/);
  });
});

test.describe("Thank You Page - Account Creation Options (Public)", () => {
  test("should display thank you message after RSVP", async ({ page }) => {
    // Submit an RSVP first
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);
    await page.locator('input[name="name"]').fill("Thank You Test");
    await page.locator('input[name="email"]').fill("thankyou@example.com");
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should be on thank you page
    await expect(page).toHaveURL(/\/invite\/.*\/thanks/);

    // Should show thank you message
    await expect(page.getByRole("heading", { name: /thanks.*rsvp/i })).toBeVisible();
  });

  test("should show party name on thank you page", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);
    await page.locator('input[name="name"]').fill("Party Name Test");
    await page.locator('input[name="email"]').fill("partyname@example.com");
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should show the party name
    await expect(page.getByText(testParties.upcoming.name)).toBeVisible();
  });

  test("should display account creation options", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);
    await page.locator('input[name="name"]').fill("Signup Options Test");
    await page.locator('input[name="email"]').fill("signup@example.com");
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should show account creation section (text is "Create an Account (Optional)")
    await expect(page.getByText(/create an account.*optional/i)).toBeVisible();
  });

  test("should show all three signup methods", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);
    await page.locator('input[name="name"]').fill("Three Methods Test");
    await page.locator('input[name="email"]').fill("methods@example.com");
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should show all three signup options
    await expect(page.getByText(/sign up with email/i)).toBeVisible();
    await expect(page.getByText(/sign up with phone/i)).toBeVisible();
    await expect(page.getByText(/sign up with google/i)).toBeVisible();
  });

  test("should pre-fill email from RSVP", async ({ page }) => {
    const testEmail = "prefill-test@example.com";

    await page.goto(`/invite/${testParties.upcoming.shareToken}`);
    await page.locator('input[name="name"]').fill("Prefill Email Test");
    await page.locator('input[name="email"]').fill(testEmail);
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // The email input in the signup section should be pre-filled
    const emailInput = page.locator('#signup-options input[type="email"]');
    await expect(emailInput).toHaveValue(testEmail);
  });

  test("should pre-fill phone from RSVP", async ({ page }) => {
    // Use valid phone number format (area code 415, exchange 555)
    const testPhone = "+14155551111";

    await page.goto(`/invite/${testParties.upcoming.shareToken}`);
    await page.locator('input[name="name"]').fill("Prefill Phone Test");
    await page.locator('input[name="phone"]').fill(testPhone);
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // The phone input in the signup section should be pre-filled
    const phoneInput = page.locator('#signup-options input[type="tel"]');
    await expect(phoneInput).toHaveValue(testPhone);
  });

  test("should show message that account is optional", async ({ page }) => {
    await page.goto(`/invite/${testParties.upcoming.shareToken}`);
    await page.locator('input[name="name"]').fill("Optional Test");
    await page.locator('input[name="email"]').fill("optional@example.com");
    await page.locator('select[name="rsvpStatus"]').selectOption("yes");
    await page.getByRole("button", { name: /submit rsvp/i }).click();

    // Should show that closing the page is fine
    await expect(page.getByText(/no account needed/i)).toBeVisible();
  });
});
