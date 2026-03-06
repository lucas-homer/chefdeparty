import { describe, it, expect } from "vitest";
import { getStepIntroMessage } from "./party-wizard-intro-messages";
import type { WizardStep } from "./wizard-schemas";

describe("getStepIntroMessage", () => {
  const steps: WizardStep[] = ["party-info", "guests", "menu", "timeline"];

  it.each(steps)("returns a valid SerializedUIMessage for %s", (step) => {
    const msg = getStepIntroMessage(step);
    expect(msg.role).toBe("assistant");
    expect(msg.id).toBe(`intro-${step}`);
    expect(msg.content).toBeTruthy();
    expect(msg.parts).toHaveLength(1);
    expect(msg.parts[0]).toEqual({ type: "text", text: msg.content });
  });

  it("returns distinct text for each step", () => {
    const texts = steps.map((s) => getStepIntroMessage(s).content);
    expect(new Set(texts).size).toBe(steps.length);
  });

  it("party-info intro contains expected copy", () => {
    const msg = getStepIntroMessage("party-info");
    expect(msg.content).toContain("Let's plan your party!");
  });

  it("guests intro contains expected copy", () => {
    const msg = getStepIntroMessage("guests");
    expect(msg.content).toContain("Who's coming?");
  });

  it("menu intro contains expected copy", () => {
    const msg = getStepIntroMessage("menu");
    expect(msg.content).toContain("What's on the menu?");
  });

  it("timeline intro contains expected copy", () => {
    const msg = getStepIntroMessage("timeline");
    expect(msg.content).toContain("cooking timeline");
  });
});
