import { describe, expect, it } from "vitest";
import { resolveDeterministicPartyInfoTurn } from "./party-info";

describe("resolveDeterministicPartyInfoTurn", () => {
  it("extracts explicit quoted rename and reuses existing datetime", () => {
    const existingDate = new Date("2026-02-22T13:00:00.000Z");
    const result = resolveDeterministicPartyInfoTurn({
      text: 'it should be called "Happy Birthday to Me"',
      currentData: {
        partyInfo: {
          name: "Old Name",
          dateTime: existingDate,
          location: "Rory's place",
          description: undefined,
          allowContributions: false,
        },
      },
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("confirm-party-info");
    // First action is update-party-info, second is confirm-party-info
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Happy Birthday to Me",
      },
    });
    expect(result.actions[1]).toMatchObject({
      type: "confirm-party-info",
      payload: {},
    });
  });

  it("handles revision phrasing like 'Call it ...' and updates the name", () => {
    const existingDate = new Date("2026-02-22T13:00:00.000Z");
    const result = resolveDeterministicPartyInfoTurn({
      text: 'Call it "Good luck Chelsea"',
      currentData: {
        partyInfo: {
          name: "Party",
          dateTime: existingDate,
          location: "Cara's house",
          description: undefined,
          allowContributions: false,
        },
      },
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("confirm-party-info");
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Good luck Chelsea",
      },
    });
    expect(result.actions[1]).toMatchObject({
      type: "confirm-party-info",
      payload: {},
    });
  });

  it("extracts name, datetime, and location from a single message", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: 'I am having a birthday party called "Happy Birthday to Me" at Rory\'s place this Sunday at 1pm',
      currentData: {},
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("confirm-party-info");
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Happy Birthday to Me",
        location: "Rory's place this Sunday at 1pm",
      },
    });
    expect(result.actions[1]).toMatchObject({
      type: "confirm-party-info",
      payload: {},
    });
  });

  it("falls through to model when name is only inferred (birthday party)", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: "I am having a birthday party this Sunday at 1pm",
      currentData: {},
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(false);
    if (result.handled) return;
    expect(result.reason).toBe("low-confidence");
  });

  it("falls through to model when name is only inferred (party with specific name user provided)", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: "I'm having a party - St. Patty's Day Party - on March 17th at 3pm. It'll be at the Ojai Pub",
      currentData: {},
      referenceNow: new Date("2026-03-06T22:59:00.000Z"),
    });

    expect(result.handled).toBe(false);
    if (result.handled) return;
    expect(result.reason).toBe("low-confidence");
  });

  it("asks for clarification when date-like text is unparseable and saves partial data", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: 'My party is called "Launch Night" at 7pm on blursday',
      currentData: {},
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("ask-unparseable-datetime");
    // Should save extracted name even though datetime is unparseable
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Launch Night",
      },
    });
  });

  it("asks for missing name when only datetime is present and saves partial data", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: "this Sunday at 1pm at Rory's place",
      currentData: {},
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("ask-missing-name");
    // Should save extracted datetime and location even though name is missing
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        // extractLocation matches the first "at" → "1pm at Rory's place"
        location: "1pm at Rory's place",
      },
    });
    // Verify datetime was saved
    const payload = result.actions[0].type === "update-party-info"
      ? result.actions[0].payload
      : undefined;
    expect(payload?.resolvedDateTime).toBeInstanceOf(Date);
  });

  it("asks for missing datetime and saves name via update-party-info", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: 'Let\'s call it "Oscars Watch Party"',
      currentData: {},
      referenceNow: new Date("2026-03-06T22:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("ask-missing-datetime");
    // Should save extracted name so it persists for the next turn
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Oscars Watch Party",
      },
    });
  });

  it("multi-turn: second message provides datetime with name already saved", () => {
    // Simulates second turn: name was saved from first turn, now user provides datetime
    const result = resolveDeterministicPartyInfoTurn({
      text: "this Sunday at 7pm",
      currentData: {
        partyInfo: {
          name: "Oscars Watch Party",
          dateTime: undefined as unknown as Date,
          location: undefined,
          description: undefined,
          allowContributions: false,
        },
      },
      referenceNow: new Date("2026-03-06T22:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    // Should now have both name (from existing) + datetime → confirm
    expect(result.intent).toBe("confirm-party-info");
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Oscars Watch Party",
      },
    });
    expect(result.actions[1]).toMatchObject({
      type: "confirm-party-info",
      payload: {},
    });
  });

  it("does NOT parse date from name when user says 'Call it Easter Sunday Brunch'", () => {
    // "Sunday" in "Easter Sunday Brunch" is part of the name, NOT a date reference
    const result = resolveDeterministicPartyInfoTurn({
      text: "Call it Easter Sunday Brunch",
      currentData: {},
      referenceNow: new Date("2026-03-07T00:04:36.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    // Should ask for datetime, NOT confirm with a false date
    expect(result.intent).toBe("ask-missing-datetime");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Easter Sunday Brunch",
      },
    });
    // There should be NO resolvedDateTime in the payload
    const payload = result.actions[0].type === "update-party-info"
      ? result.actions[0].payload
      : undefined;
    expect(payload?.resolvedDateTime).toBeUndefined();
  });

  it("does NOT parse date from name when user says 'Let\\'s call it Super Bowl Sunday Party'", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: "Let's call it Super Bowl Sunday Party",
      currentData: {},
      referenceNow: new Date("2026-02-01T12:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("ask-missing-datetime");
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "Super Bowl Sunday Party",
      },
    });
  });

  it("includes partialActions when falling through with low-confidence", () => {
    // "I'm having a party on Sunday April 5th at Cara's House"
    // → name is only inferred ("Party"), so low-confidence
    // → BUT dateTime and location WERE successfully extracted
    // → partialActions should save them so they persist
    const result = resolveDeterministicPartyInfoTurn({
      text: "I'm having a party on Sunday April 5th at Cara's House",
      currentData: {},
      referenceNow: new Date("2026-03-07T00:04:20.000Z"),
    });

    expect(result.handled).toBe(false);
    if (result.handled) return;
    expect(result.reason).toBe("low-confidence");
    // Should include partial actions to save the date/location
    expect(result.partialActions).toBeDefined();
    expect(result.partialActions).toHaveLength(1);
    expect(result.partialActions![0]).toMatchObject({
      type: "update-party-info",
    });
    // Should have the location
    const payload = result.partialActions![0].type === "update-party-info"
      ? result.partialActions![0].payload
      : undefined;
    expect(payload?.location).toBeDefined();
    // Should have a dateTime
    expect(payload?.resolvedDateTime).toBeInstanceOf(Date);
  });

  it("handles time-only revision 'change the time so it starts at 5pm'", () => {
    const existingDate = new Date("2026-03-17T15:00:00.000Z");
    const result = resolveDeterministicPartyInfoTurn({
      text: "change the time so it starts at 5pm",
      currentData: {
        partyInfo: {
          name: "St. Patty's Day Party",
          dateTime: existingDate,
          location: "Ojai Pub",
          description: undefined,
          allowContributions: false,
        },
      },
      referenceNow: new Date("2026-03-06T22:42:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("confirm-party-info");
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({
      type: "update-party-info",
      payload: {
        name: "St. Patty's Day Party",
      },
    });
    // The resolved time should be 5pm on the EXISTING date (March 17), not today
    const resolvedDateTime = result.actions[0].type === "update-party-info"
      ? result.actions[0].payload.resolvedDateTime
      : undefined;
    expect(resolvedDateTime).toBeInstanceOf(Date);
    expect(resolvedDateTime!.getDate()).toBe(17);
    expect(resolvedDateTime!.getMonth()).toBe(2); // March
    expect(resolvedDateTime!.getHours()).toBe(17); // 5pm
  });

  it("handles time-only revision 'start at 2pm'", () => {
    const existingDate = new Date("2026-07-04T18:00:00.000Z");
    const result = resolveDeterministicPartyInfoTurn({
      text: "start at 2pm",
      currentData: {
        partyInfo: {
          name: "BBQ Party",
          dateTime: existingDate,
          location: "the backyard",
          description: undefined,
          allowContributions: true,
        },
      },
      referenceNow: new Date("2026-03-06T12:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("confirm-party-info");
    expect(result.actions).toHaveLength(2);
    const resolvedDateTime = result.actions[0].type === "update-party-info"
      ? result.actions[0].payload.resolvedDateTime
      : undefined;
    expect(resolvedDateTime).toBeInstanceOf(Date);
    expect(resolvedDateTime!.getDate()).toBe(4); // July 4th preserved
    expect(resolvedDateTime!.getMonth()).toBe(6); // July
    expect(resolvedDateTime!.getHours()).toBe(14); // 2pm
  });

  it("handles time-only revision 'change the time to 7:30pm'", () => {
    const existingDate = new Date("2026-02-22T13:00:00.000Z");
    const result = resolveDeterministicPartyInfoTurn({
      text: "change the time to 7:30pm",
      currentData: {
        partyInfo: {
          name: "Happy Birthday to Me",
          dateTime: existingDate,
          location: "Rory's place",
          description: undefined,
          allowContributions: false,
        },
      },
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("confirm-party-info");
    expect(result.actions).toHaveLength(2);
    const resolvedDateTime = result.actions[0].type === "update-party-info"
      ? result.actions[0].payload.resolvedDateTime
      : undefined;
    expect(resolvedDateTime).toBeInstanceOf(Date);
    expect(resolvedDateTime!.getDate()).toBe(22); // Feb 22 preserved
    expect(resolvedDateTime!.getHours()).toBe(19); // 7pm
    expect(resolvedDateTime!.getMinutes()).toBe(30);
  });
});
