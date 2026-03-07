import { describe, expect, it } from "vitest";
import { parsePartyDateTimeInput } from "./party-date-parser";

describe("parsePartyDateTimeInput", () => {
  it("resolves 'this weekend ... Saturday at 7pm' to the correct future date", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0); // Monday, February 16, 2026
    const parsed = parsePartyDateTimeInput("I'm having a party this weekend, on Saturday, at 7pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getFullYear()).toBe(2026);
    expect(parsed?.date.getMonth()).toBe(1);
    expect(parsed?.date.getDate()).toBe(21);
    expect(parsed?.date.getDay()).toBe(6);
    expect(parsed?.date.getHours()).toBe(19);
    expect(parsed?.date.getMinutes()).toBe(0);
    expect(parsed?.hasExplicitTime).toBe(true);
  });

  it("resolves unqualified weekday references to the next upcoming weekday", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0); // Monday
    const parsed = parsePartyDateTimeInput("Saturday at 7pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getFullYear()).toBe(2026);
    expect(parsed?.date.getMonth()).toBe(1);
    expect(parsed?.date.getDate()).toBe(21);
    expect(parsed?.date.getDay()).toBe(6);
    expect(parsed?.date.getHours()).toBe(19);
    expect(parsed?.date.getMinutes()).toBe(0);
    expect(parsed?.hasExplicitTime).toBe(true);
  });

  it("rolls month/day references without a year into the next year when needed", () => {
    const now = new Date(2026, 10, 20, 12, 0, 0); // Nov 20, 2026
    const parsed = parsePartyDateTimeInput("March 15 at 6pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getFullYear()).toBe(2027);
    expect(parsed?.date.getMonth()).toBe(2);
    expect(parsed?.date.getDate()).toBe(15);
    expect(parsed?.date.getHours()).toBe(18);
    expect(parsed?.date.getMinutes()).toBe(0);
    expect(parsed?.hasExplicitTime).toBe(true);
  });

  it("prefers month-day over weekday when both are present: 'Sunday, April 5th at 1pm'", () => {
    const now = new Date(2026, 2, 7, 0, 4, 20); // March 7, 2026
    const parsed = parsePartyDateTimeInput(
      "I'm having a party for Sunday, April 5th at 1pm. It'll be at Cara's House",
      now
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getMonth()).toBe(3); // April (0-indexed)
    expect(parsed?.date.getDate()).toBe(5);
    expect(parsed?.date.getHours()).toBe(13); // 1pm
    expect(parsed?.date.getMinutes()).toBe(0);
    expect(parsed?.hasExplicitTime).toBe(true);
  });

  it("prefers month-day over weekday: 'Saturday March 17th at 3pm'", () => {
    const now = new Date(2026, 2, 6, 22, 59, 0); // March 6, 2026
    const parsed = parsePartyDateTimeInput("Saturday March 17th at 3pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getMonth()).toBe(2); // March (0-indexed)
    expect(parsed?.date.getDate()).toBe(17);
    expect(parsed?.date.getHours()).toBe(15); // 3pm
    expect(parsed?.hasExplicitTime).toBe(true);
  });

  it("still handles plain weekday references without month-day", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0); // Monday, Feb 16
    const parsed = parsePartyDateTimeInput("this Sunday at 3pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getDay()).toBe(0); // Sunday
    expect(parsed?.date.getHours()).toBe(15); // 3pm
    expect(parsed?.hasExplicitTime).toBe(true);
  });

  it("returns null for unparseable date text", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0);
    const parsed = parsePartyDateTimeInput("sometime after work maybe", now);

    expect(parsed).toBeNull();
  });

  // hasExplicitTime tests
  it("reports hasExplicitTime: false for date-only input 'April 5th'", () => {
    const now = new Date(2026, 2, 7, 0, 0, 0); // March 7, 2026
    const parsed = parsePartyDateTimeInput("April 5th", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getMonth()).toBe(3); // April
    expect(parsed?.date.getDate()).toBe(5);
    expect(parsed?.hasExplicitTime).toBe(false);
  });

  it("reports hasExplicitTime: false for 'this Sunday' without time", () => {
    const now = new Date(2026, 1, 16, 9, 0, 0); // Monday, Feb 16
    const parsed = parsePartyDateTimeInput("this Sunday", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getDay()).toBe(0); // Sunday
    expect(parsed?.hasExplicitTime).toBe(false);
  });

  it("reports hasExplicitTime: false for 'tomorrow' without time", () => {
    const now = new Date(2026, 2, 6, 12, 0, 0);
    const parsed = parsePartyDateTimeInput("tomorrow", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.hasExplicitTime).toBe(false);
  });

  it("reports hasExplicitTime: true for 'tomorrow at 2pm'", () => {
    const now = new Date(2026, 2, 6, 12, 0, 0);
    const parsed = parsePartyDateTimeInput("tomorrow at 2pm", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getHours()).toBe(14);
    expect(parsed?.hasExplicitTime).toBe(true);
  });

  it("reports hasExplicitTime: false for 'Sunday, April 5th' without time", () => {
    const now = new Date(2026, 2, 7, 0, 4, 20);
    const parsed = parsePartyDateTimeInput("Sunday, April 5th", now);

    expect(parsed).not.toBeNull();
    expect(parsed?.date.getMonth()).toBe(3);
    expect(parsed?.date.getDate()).toBe(5);
    expect(parsed?.hasExplicitTime).toBe(false);
  });
});
