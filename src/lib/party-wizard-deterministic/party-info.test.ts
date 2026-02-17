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
    expect(result.actions[0]).toMatchObject({
      type: "confirm-party-info",
      payload: {
        name: "Happy Birthday to Me",
      },
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
      type: "confirm-party-info",
      payload: {
        name: "Good luck Chelsea",
      },
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
      type: "confirm-party-info",
      payload: {
        name: "Happy Birthday to Me",
        location: "Rory's place this Sunday at 1pm",
      },
    });
  });

  it("infers a default name for birthday context", () => {
    const result = resolveDeterministicPartyInfoTurn({
      text: "I am having a birthday party this Sunday at 1pm",
      currentData: {},
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("confirm-party-info");
    expect(result.actions[0]).toMatchObject({
      type: "confirm-party-info",
      payload: {
        name: "Birthday Party",
      },
    });
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
});
