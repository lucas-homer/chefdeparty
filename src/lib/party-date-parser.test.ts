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

  it("prefers month-day over weekday when both are present: 'Sunday, April 5th at 1pm'", () => {
    // "Sunday" is a weekday AND "April 5th" is a month-day.
    // The parser should prefer the more specific month-day pattern.
    const now = new Date(2026, 2, 7, 0, 4, 20); // March 7, 2026
    const parsed = parsePartyDateTimeInput(
      "I'm having a party for Sunday, April 5th at 1pm. It'll be at Cara's House",
      now
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.getMonth()).toBe(3); // April (0-indexed)
    expect(parsed?.getDate()).toBe(5);
    expect(parsed?.getHours()).toBe(13); // 1pm
    expect(parsed?.getMinutes()).toBe(0);
  });

  it("prefers month-day over weekday: 'Saturday March 17th at 3pm'", () => {
    const now = new Date(2026, 2, 6, 22, 59, 0); // March 6, 2026
    const parsed = parsePartyDateTimeInput("Saturday March 17th at 3pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.getMonth()).toBe(2); // March (0-indexed)
    expect(parsed?.getDate()).toBe(17);
    expect(parsed?.getHours()).toBe(15); // 3pm
  });

  it("still handles plain weekday references without month-day", () => {
    // When only a weekday is present (no month-day), the relative parser should still work
    const now = new Date(2026, 1, 16, 9, 0, 0); // Monday, Feb 16
    const parsed = parsePartyDateTimeInput("this Sunday at 3pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.getDay()).toBe(0); // Sunday
    expect(parsed?.getHours()).toBe(15); // 3pm
  });

  it("returns null for unparseable date text", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0);
    const parsed = parsePartyDateTimeInput("sometime after work maybe", now);

    expect(parsed).toBeNull();
  });
});
