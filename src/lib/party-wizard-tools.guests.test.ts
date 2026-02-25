import { describe, expect, it } from "vitest";
import { getWizardTools } from "./party-wizard-tools";
import type { WizardState } from "./wizard-schemas";

describe("guest tools", () => {
  it("normalizes name-only guest data from loose model input", async () => {
    const currentData: Partial<WizardState> = { guestList: [] };
    const tools = getWizardTools("guests", {
      db: {} as never,
      userId: "test-user",
      env: {} as never,
      currentData,
      sessionId: undefined,
    });

    const addGuest = tools.addGuest as { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> };
    const result = await addGuest.execute({ email: "Alice" });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Added Alice");
    expect(currentData.guestList).toEqual([{ name: "Alice", email: undefined, phone: undefined }]);
  });

  it("serializes concurrent addGuest executions so persisted guest list does not lose updates", async () => {
    let persistedGuestList: Array<{ name?: string; email?: string; phone?: string }> = [];
    const db = {
      update: () => ({
        set: (updates: Record<string, unknown>) => ({
          where: async () => {
            const list = updates.guestList as Array<{ name?: string; email?: string; phone?: string }> | undefined;
            if (!list) return;

            // Simulate out-of-order DB completion: shorter lists finish last and can clobber data.
            const delay = list.length === 1 ? 30 : list.length === 2 ? 20 : 10;
            await new Promise((resolve) => setTimeout(resolve, delay));
            persistedGuestList = list;
          },
        }),
      }),
    };

    const currentData: Partial<WizardState> = { guestList: [] };
    const tools = getWizardTools("guests", {
      db: db as never,
      userId: "test-user",
      env: {} as never,
      currentData,
      sessionId: "7f2a8fcf-f6ef-488d-9cc7-e0bdebc8ec29",
    });

    const addGuest = tools.addGuest as { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> };

    await Promise.all([
      addGuest.execute({ name: "Pete" }),
      addGuest.execute({ name: "Ross" }),
      addGuest.execute({ name: "Dahn" }),
    ]);

    expect(currentData.guestList).toHaveLength(3);
    expect(persistedGuestList).toHaveLength(3);
    expect(persistedGuestList.map((guest) => guest.name)).toEqual(["Pete", "Ross", "Dahn"]);
  });
});
