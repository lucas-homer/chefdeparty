import { describe, expect, it } from "vitest";
import { parsePartyDateTimeInput } from "./party-date-parser";

describe("parsePartyDateTimeInput", () => {
  it("resolves 'this weekend ... Saturday at 7pm' to the correct future date", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0); // Monday, February 16, 2026
    const parsed = parsePartyDateTimeInput("I'm having a party this weekend, on Saturday, at 7pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(21);
    expect(parsed?.getDay()).toBe(6);
    expect(parsed?.getHours()).toBe(19);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it("resolves unqualified weekday references to the next upcoming weekday", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0); // Monday
    const parsed = parsePartyDateTimeInput("Saturday at 7pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(21);
    expect(parsed?.getDay()).toBe(6);
    expect(parsed?.getHours()).toBe(19);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it("rolls month/day references without a year into the next year when needed", () => {
    const now = new Date(2026, 10, 20, 12, 0, 0); // Nov 20, 2026
    const parsed = parsePartyDateTimeInput("March 15 at 6pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2027);
    expect(parsed?.getMonth()).toBe(2);
    expect(parsed?.getDate()).toBe(15);
    expect(parsed?.getHours()).toBe(18);
    expect(parsed?.getMinutes()).toBe(0);
  });

  it("returns null for unparseable date text", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0);
    const parsed = parsePartyDateTimeInput("sometime after work maybe", now);

    expect(parsed).toBeNull();
  });
});
