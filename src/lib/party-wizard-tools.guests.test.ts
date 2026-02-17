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
});
