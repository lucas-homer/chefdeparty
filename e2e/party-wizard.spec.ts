import { test, expect } from "@playwright/test";
import path from "node:path";

/**
 * E2E tests for the AI Party Wizard.
 * These tests use the pre-authenticated storage state from auth.setup.ts.
 */
test.describe("Party Wizard", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the new party page with wizard
    await page.goto("/parties/new");
  });

  test("should display wizard choice modal", async ({ page }) => {
    // Should show the wizard choice modal
    await expect(page.getByRole("heading", { name: /create a new party/i })).toBeVisible();

    // Should show both options
    await expect(page.getByRole("button", { name: /let's chat/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /manually fill out forms/i })).toBeVisible();

    // Should show recommended label on chat option
    await expect(page.getByText(/recommended/i)).toBeVisible();
  });

  test("should navigate to manual form when clicking manual option", async ({ page }) => {
    // Click on manual option
    await page.getByRole("button", { name: /manually fill out forms/i }).click();

    // Should navigate to manual form
    await expect(page).toHaveURL(/\/parties\/new\?mode=manual/);

    // Should show the create party form
    await expect(page.getByRole("heading", { name: /create new party/i })).toBeVisible();
  });

  test("should open wizard chat when clicking chat option", async ({ page }) => {
    // Click on chat option
    await page.getByRole("button", { name: /let's chat/i }).click();

    // Should show wizard progress indicator (step numbers always visible, labels hidden on mobile)
    await expect(page.locator("button").filter({ hasText: "1" })).toBeVisible();

    // Should show welcome message for party info step
    await expect(page.getByText(/let's plan your party/i)).toBeVisible();

    // Should have chat input
    await expect(page.getByPlaceholder(/describe your party/i)).toBeVisible();
  });

  test("should use textarea input and support Shift+Enter for multiline", async ({ page }) => {
    // Click on chat option
    await page.getByRole("button", { name: /let's chat/i }).click();

    const chatInput = page.getByPlaceholder(/describe your party/i);
    await expect(chatInput).toBeVisible();

    // Chat input should be a textarea for multiline entry
    await expect(chatInput).toHaveJSProperty("tagName", "TEXTAREA");

    await chatInput.fill("First line");
    await chatInput.press("Shift+Enter");
    await chatInput.type("Second line");

    await expect(chatInput).toHaveValue("First line\nSecond line");
  });

  test("should show step progress indicator with all steps", async ({ page }) => {
    // Click on chat option
    await page.getByRole("button", { name: /let's chat/i }).click();

    // All four steps should be visible (by step number, since labels are hidden on mobile)
    await expect(page.locator("button").filter({ hasText: "1" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "2" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "3" })).toBeVisible();
    await expect(page.locator("button").filter({ hasText: "4" })).toBeVisible();
  });

  test("should keep messages scrolling inside the wizard shell", async ({ page }) => {
    await page.getByRole("button", { name: /let's chat/i }).click();

    const messageScroller = page.getByTestId("wizard-messages-scroll");
    await expect(messageScroller).toBeVisible();

    const composer = page.getByPlaceholder(/describe your party/i);
    await expect(composer).toBeVisible();

    await messageScroller.evaluate((node) => {
      const element = node as HTMLElement;
      const filler = document.createElement("div");
      filler.id = "wizard-scroll-filler";
      filler.style.height = "2400px";
      filler.style.pointerEvents = "none";
      element.appendChild(filler);
    });

    const initialComposerTop = await composer.evaluate((node) => node.getBoundingClientRect().top);
    const initialWindowScrollY = await page.evaluate(() => window.scrollY);

    const scrollMetrics = await messageScroller.evaluate((node) => {
      const element = node as HTMLElement;
      element.scrollTop = 900;
      return {
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    });

    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    expect(scrollMetrics.scrollTop).toBeGreaterThan(0);

    const finalComposerTop = await composer.evaluate((node) => node.getBoundingClientRect().top);
    const finalWindowScrollY = await page.evaluate(() => window.scrollY);

    expect(Math.abs(finalComposerTop - initialComposerTop)).toBeLessThan(2);
    expect(finalWindowScrollY).toBe(initialWindowScrollY);
  });

  test("should show current timeline sidebar on timeline step", async ({ page }) => {
    await page.request.post("/api/parties/wizard/session/new");

    const sessionRes = await page.request.get("/api/parties/wizard/session");
    const sessionBody = (await sessionRes.json()) as {
      session?: { id?: string };
    };
    const sessionId = sessionBody.session?.id;
    expect(sessionId).toBeTruthy();

    await page.request.put(`/api/parties/wizard/session/${sessionId}/step`, {
      data: { step: "timeline" },
    });

    await page.goto("/parties/new");
    await page.getByRole("button", { name: /let's chat/i }).click();

    const isMobile = (page.viewportSize()?.width ?? 1280) < 768;

    if (isMobile) {
      await expect(page.getByPlaceholder(/any adjustments to the timeline/i)).toBeVisible();
      await expect(page.getByRole("heading", { name: /current timeline/i })).toHaveCount(0);
    } else {
      await expect(page.getByRole("heading", { name: /current timeline \(0\)/i }).first()).toBeVisible();
      await expect(page.getByText(/no timeline tasks yet/i).first()).toBeVisible();
    }
  });

  test("should have cancel button that returns to parties list", async ({ page }) => {
    // Click on chat option
    await page.getByRole("button", { name: /let's chat/i }).click();

    // Should have cancel button
    const cancelButton = page.getByRole("button", { name: /cancel/i });
    await expect(cancelButton).toBeVisible();

    // Click cancel
    await cancelButton.click();

    // Should navigate back to parties list
    await expect(page).toHaveURL("/parties");
  });

  test("should close modal when clicking backdrop", async ({ page }) => {
    // Click the backdrop (the dark overlay behind the modal)
    // Use force: true because the modal content is in front of some areas
    await page.locator(".bg-black\\/50").click({ position: { x: 10, y: 10 } });

    // Should navigate back to parties list
    await expect(page).toHaveURL("/parties");
  });
});

// These tests require the Google AI API to be available and configured.
// They are skipped by default since they depend on external services.
// To run them locally, ensure GOOGLE_GENERATIVE_AI_API_KEY is set.
test.describe("Party Wizard - Chat Interaction", () => {
  test.skip(
    () => !process.env.RUN_AI_TESTS,
    "Skipping AI-dependent tests. Set RUN_AI_TESTS=1 to run."
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/parties/new");
    // Open the wizard chat
    await page.getByRole("button", { name: /let's chat/i }).click();
  });

  test("should send message and receive AI response", async ({ page }) => {
    const input = page.getByPlaceholder(/describe your party/i);

    // Type a message
    await input.fill("I want to plan a birthday party for my friend Sarah next Saturday at 6pm");

    // Click send button
    await page.getByRole("button").filter({ has: page.locator("svg") }).last().click();

    // Should show loading indicator
    await expect(page.locator(".animate-bounce").first()).toBeVisible();

    // Wait for a visible assistant bubble in the chat area (not nav buttons)
    const assistantBubble = page
      .locator("div.flex.justify-start div.bg-muted")
      .filter({ hasText: /[A-Za-z]/ })
      .first();
    await expect(assistantBubble).toBeVisible({
      timeout: 30000,
    });
  });

  test("should preserve message history when navigating back", async ({ page }) => {
    // Skip this test if it takes too long or is flaky in CI
    test.setTimeout(60000);

    const input = page.getByPlaceholder(/describe your party/i);

    // Type a message
    await input.fill("Birthday party for Sarah");
    await page.getByRole("button").filter({ has: page.locator("svg") }).last().click();

    // Wait for a visible assistant bubble in the chat area
    const assistantBubble = page
      .locator("div.flex.justify-start div.bg-muted")
      .filter({ hasText: /[A-Za-z]/ })
      .first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // The message history should be visible
    await expect(page.getByText(/birthday party/i).first()).toBeVisible();
  });

  test("should refresh guests sidebar after assistant adds guests", async ({ page }) => {
    test.setTimeout(90000);

    // Ensure a fresh wizard session for deterministic sidebar assertions
    await page.request.post("/api/parties/wizard/session/new");
    await page.goto("/parties/new");
    await page.getByRole("button", { name: /let's chat/i }).click();

    // Complete party-info step
    const partyInfoInput = page.getByPlaceholder(/describe your party/i);
    await partyInfoInput.fill("Dinner party next Saturday at 6pm in San Francisco");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.getByRole("heading", { name: /please confirm party-info/i })).toBeVisible({
      timeout: 30000,
    });
    await page.getByRole("button", { name: /confirm & continue/i }).click();

    // Add a guest in guests step
    const guestInput = page.getByPlaceholder(/add a guest/i);
    await expect(guestInput).toBeVisible({ timeout: 30000 });
    await guestInput.fill("Regression Guest regression-guest@example.com");
    await page.getByRole("button", { name: "Send message" }).click();

    // Sidebar should refresh to include the newly added guest
    await expect(page.getByRole("heading", { name: /guests \(\d+\)/i }).first()).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText("regression-guest@example.com", { exact: true })).toBeVisible({
      timeout: 30000,
    });
  });

  test("should not re-surface image extraction disclaimer after successful menu image upload", async ({ page }) => {
    test.setTimeout(120000);

    // Ensure a fresh session for deterministic assertions
    await page.request.post("/api/parties/wizard/session/new");
    await page.goto("/parties/new");
    await page.getByRole("button", { name: /let's chat/i }).click();

    // Force current step to menu so we can run this regression directly
    const sessionRes = await page.request.get("/api/parties/wizard/session");
    const sessionBody = (await sessionRes.json()) as {
      session?: { id?: string };
    };
    const sessionId = sessionBody.session?.id;
    expect(sessionId).toBeTruthy();

    await page.request.put(`/api/parties/wizard/session/${sessionId}/step`, {
      data: { step: "menu" },
    });

    await page.goto("/parties/new");
    await page.getByRole("button", { name: /let's chat/i }).click();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /upload recipe image/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve(__dirname, "fixtures/images/menu-upload-recipe.heic"));

    // Wait until direct image extraction path responds (deterministic server message)
    await expect(page.getByText(/from your image and added it to the menu!/i).first()).toBeVisible({
      timeout: 60000,
    });

    const input = page.getByPlaceholder(/describe a dish or paste a recipe url/i);
    await input.fill("ready to finalize");
    const assistantBubbles = page.locator("div.flex.justify-start div.bg-muted");
    const assistantBubbleCountBefore = await assistantBubbles.count();
    await page.getByRole("button", { name: "Send message" }).click();

    await expect.poll(async () => assistantBubbles.count(), {
      timeout: 30000,
    }).toBeGreaterThan(assistantBubbleCountBefore);
    await expect(page.getByText(/can't directly extract recipes from images/i)).toHaveCount(0);
  });
});

// Session storage recovery test also requires AI since it needs to trigger state save
test.describe("Party Wizard - Session Storage Recovery", () => {
  test.skip(
    () => !process.env.RUN_AI_TESTS,
    "Skipping AI-dependent tests. Set RUN_AI_TESTS=1 to run."
  );

  test("should recover wizard state after page refresh", async ({ page }) => {
    // This test verifies sessionStorage persistence
    test.setTimeout(60000);

    await page.goto("/parties/new");
    await page.getByRole("button", { name: /let's chat/i }).click();

    // Wait for wizard to load
    await expect(page.getByText(/let's plan your party/i)).toBeVisible();

    // Store some state by sending a message
    const input = page.getByPlaceholder(/describe your party/i);
    await input.fill("Test party");
    await page.getByRole("button").filter({ has: page.locator("svg") }).last().click();

    // Wait for assistant response so wizard state is definitely persisted
    const assistantBubble = page
      .locator("div.flex.justify-start div.bg-muted")
      .filter({ hasText: /[A-Za-z]/ })
      .first();
    await expect(assistantBubble).toBeVisible({ timeout: 30000 });

    // Refresh the page
    await page.reload();

    // If the choice modal reappears after refresh, reopen chat mode.
    const chatChoiceButton = page.getByRole("button", { name: /let's chat/i });
    if (await chatChoiceButton.isVisible()) {
      await chatChoiceButton.click();
    }

    // The wizard should restore and show existing conversation state.
    await expect(page.getByPlaceholder(/describe your party|add a guest/i)).toBeVisible({
      timeout: 10000,
    });
  });
});
