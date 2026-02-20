import { describe, expect, it } from "vitest";
import { wizardCompleteRequestSchema } from "./wizard-schemas";
import { normalizeWizardCompletePayload } from "./wizard-complete-normalization";

describe("normalizeWizardCompletePayload", () => {
  it("normalizes relaxed timeline values into completion-safe data", () => {
    const normalized = normalizeWizardCompletePayload({
      partyInfo: {
        name: "Sunday Post-Run Meal",
        dateTime: "2026-02-22T09:00:00.000Z",
      },
      guestList: [
        { name: "Pete" },
      ],
      menuPlan: {
        existingRecipes: [],
        newRecipes: [
          {
            name: "Wang Mandu",
            ingredients: [{ ingredient: "flour" }],
            instructions: [{ step: 1, description: "Mix and fold." }],
            prepTimeMinutes: 0,
            cookTimeMinutes: "45",
            servings: "0",
            sourceType: "url",
          },
        ],
      },
      timeline: [
        {
          recipeId: "not-a-uuid",
          description: "Chop vegetables",
          daysBeforeParty: "1",
          scheduledTime: "8:10 AM",
          durationMinutes: "25",
          isPhaseStart: 1,
        },
      ],
    });

    const parsed = wizardCompleteRequestSchema.safeParse(normalized);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.guestList).toEqual([{ name: "Pete", email: undefined, phone: undefined }]);
    expect(parsed.data.menuPlan.newRecipes[0]?.prepTimeMinutes).toBeUndefined();
    expect(parsed.data.menuPlan.newRecipes[0]?.cookTimeMinutes).toBe(45);
    expect(parsed.data.menuPlan.newRecipes[0]?.servings).toBeUndefined();
    expect(parsed.data.timeline[0]?.recipeId).toBeNull();
    expect(parsed.data.timeline[0]?.scheduledTime).toBe("08:10");
    expect(parsed.data.timeline[0]?.daysBeforeParty).toBe(1);
    expect(parsed.data.timeline[0]?.durationMinutes).toBe(25);
    expect(parsed.data.timeline[0]?.isPhaseStart).toBe(true);
  });

  it("falls back to defaults for invalid timeline numerics and time", () => {
    const normalized = normalizeWizardCompletePayload({
      partyInfo: {
        name: "Birthday",
        dateTime: "2026-03-01T18:00:00.000Z",
      },
      guestList: [],
      menuPlan: { existingRecipes: [], newRecipes: [] },
      timeline: [
        {
          description: "Set the table",
          daysBeforeParty: -3,
          scheduledTime: "later",
          durationMinutes: 0,
        },
      ],
    });

    const parsed = wizardCompleteRequestSchema.safeParse(normalized);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.timeline[0]?.daysBeforeParty).toBe(0);
    expect(parsed.data.timeline[0]?.scheduledTime).toBe("09:00");
    expect(parsed.data.timeline[0]?.durationMinutes).toBe(30);
  });
});
