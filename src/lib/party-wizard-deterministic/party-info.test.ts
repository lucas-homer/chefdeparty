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

  it("asks for clarification when date-like text is unparseable", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: 'My party is called "Launch Night" at 7pm on blursday',
      currentData: {},
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result).toMatchObject({
      handled: true,
      intent: "ask-unparseable-datetime",
    });
  });

  it("asks for missing name when only datetime is present", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: "this Sunday at 1pm at Rory's place",
      currentData: {},
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result).toMatchObject({
      handled: true,
      intent: "ask-missing-name",
    });
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
