import { describe, expect, it } from "vitest";
import { updatePartyInfoAction, confirmPartyInfoAction } from "./party-info";
import type { WizardState, PartyInfoData } from "../wizard-schemas";

function makePartyInfo(overrides: Partial<PartyInfoData> = {}): PartyInfoData {
  return {
    name: "BBQ Party",
    dateTime: new Date("2026-07-04T16:00:00.000Z"),
    location: "the backyard",
    description: "Casual summer cookout",
    allowContributions: true,
    ...overrides,
  };
}

describe("updatePartyInfoAction", () => {
  const referenceNow = new Date("2026-03-06T12:00:00.000Z");

  it("sets partyInfo from scratch when none exists", async () => {
    const currentData: Partial<WizardState> = {};
    const result = await updatePartyInfoAction(
      { db: {} as never, userId: "u1", sessionId: undefined, currentData, referenceNow },
      { name: "BBQ", dateTimeInput: "Saturday at 3pm" }
    );

    expect(result.success).toBe(true);
    expect(result).toMatchObject({
      action: "updatePartyInfo",
      message: "Updated party details.",
    });
    if (!result.success) return;
    expect(result.partyInfo.name).toBe("BBQ");
    expect(result.partyInfo.dateTime).toBeInstanceOf(Date);
    // currentData should be updated in place
    expect(currentData.partyInfo).toBe(result.partyInfo);
  });

  it("merges partial update with existing partyInfo", async () => {
    const existing = makePartyInfo();
    const currentData: Partial<WizardState> = { partyInfo: existing };
    const result = await updatePartyInfoAction(
      { db: {} as never, userId: "u1", sessionId: undefined, currentData, referenceNow },
      { dateTimeInput: "July 5 at 3pm" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Name, location, description, allowContributions preserved
    expect(result.partyInfo.name).toBe("BBQ Party");
    expect(result.partyInfo.location).toBe("the backyard");
    expect(result.partyInfo.description).toBe("Casual summer cookout");
    expect(result.partyInfo.allowContributions).toBe(true);
    // DateTime changed
    expect(result.partyInfo.dateTime.getDate()).toBe(5);
  });

  it("updates only name, preserving all other fields", async () => {
    const existing = makePartyInfo();
    const originalDateTime = new Date(existing.dateTime);
    const currentData: Partial<WizardState> = { partyInfo: existing };
    const result = await updatePartyInfoAction(
      { db: {} as never, userId: "u1", sessionId: undefined, currentData, referenceNow },
      { name: "Summer BBQ" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.partyInfo.name).toBe("Summer BBQ");
    expect(result.partyInfo.dateTime.getTime()).toBe(originalDateTime.getTime());
    expect(result.partyInfo.location).toBe("the backyard");
    expect(result.partyInfo.description).toBe("Casual summer cookout");
    expect(result.partyInfo.allowContributions).toBe(true);
  });

  it("returns error on unparseable dateTimeInput", async () => {
    const currentData: Partial<WizardState> = {};
    const result = await updatePartyInfoAction(
      { db: {} as never, userId: "u1", sessionId: undefined, currentData, referenceNow },
      { name: "Party", dateTimeInput: "blursday at noon" }
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("couldn't understand");
  });

  it("returns existing partyInfo unchanged when no fields provided", async () => {
    const existing = makePartyInfo();
    const currentData: Partial<WizardState> = { partyInfo: existing };
    const result = await updatePartyInfoAction(
      { db: {} as never, userId: "u1", sessionId: undefined, currentData, referenceNow },
      {}
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.partyInfo.name).toBe(existing.name);
    expect(result.partyInfo.dateTime.getTime()).toBe(new Date(existing.dateTime).getTime());
    expect(result.partyInfo.location).toBe(existing.location);
  });

  it("accepts resolvedDateTime for deterministic path", async () => {
    const resolved = new Date("2026-08-15T19:00:00.000Z");
    const currentData: Partial<WizardState> = {};
    const result = await updatePartyInfoAction(
      { db: {} as never, userId: "u1", sessionId: undefined, currentData, referenceNow },
      { name: "August Party", resolvedDateTime: resolved }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.partyInfo.dateTime.getTime()).toBe(resolved.getTime());
  });

  it("can clear optional fields by passing empty strings", async () => {
    const existing = makePartyInfo();
    const currentData: Partial<WizardState> = { partyInfo: existing };
    const result = await updatePartyInfoAction(
      { db: {} as never, userId: "u1", sessionId: undefined, currentData, referenceNow },
      { location: "", description: "" }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.partyInfo.location).toBe("");
    expect(result.partyInfo.description).toBe("");
    // Other fields preserved
    expect(result.partyInfo.name).toBe("BBQ Party");
  });
});

describe("confirmPartyInfoAction (zero-arg)", () => {
  it("reads from currentData and emits confirmation request", async () => {
    const writes: unknown[] = [];
    const partyInfo = makePartyInfo();
    const currentData: Partial<WizardState> = { partyInfo };

    const result = await confirmPartyInfoAction({
      db: {} as never,
      userId: "u1",
      sessionId: undefined,
      currentData,
      writer: { write: (chunk: unknown) => writes.push(chunk) } as never,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.action).toBe("awaitingConfirmation");
    expect(result.message).toBe("Please confirm the party details above.");
    expect(result.partyInfo).toBe(partyInfo);
    expect(result.request.step).toBe("party-info");
    expect(result.request.nextStep).toBe("guests");
    expect(result.request.summary).toContain("BBQ Party");

    // Writer should have received data-step-confirmation-request
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      type: "data-step-confirmation-request",
      data: { request: result.request },
    });
  });

  it("returns error when partyInfo is null", async () => {
    const currentData: Partial<WizardState> = { partyInfo: null };
    const result = await confirmPartyInfoAction({
      db: {} as never,
      userId: "u1",
      sessionId: undefined,
      currentData,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("incomplete");
  });

  it("returns error when partyInfo is undefined", async () => {
    const currentData: Partial<WizardState> = {};
    const result = await confirmPartyInfoAction({
      db: {} as never,
      userId: "u1",
      sessionId: undefined,
      currentData,
    });

    expect(result.success).toBe(false);
  });

  it("returns error when partyInfo missing name", async () => {
    const currentData: Partial<WizardState> = {
      partyInfo: makePartyInfo({ name: "" }),
    };
    const result = await confirmPartyInfoAction({
      db: {} as never,
      userId: "u1",
      sessionId: undefined,
      currentData,
    });

    expect(result.success).toBe(false);
  });

  it("works without writer (no data parts emitted)", async () => {
    const currentData: Partial<WizardState> = { partyInfo: makePartyInfo() };
    const result = await confirmPartyInfoAction({
      db: {} as never,
      userId: "u1",
      sessionId: undefined,
      currentData,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.request.summary).toContain("BBQ Party");
  });

  it("includes location in summary when present", async () => {
    const currentData: Partial<WizardState> = {
      partyInfo: makePartyInfo({ location: "Ojai Pub" }),
    };
    const result = await confirmPartyInfoAction({
      db: {} as never,
      userId: "u1",
      sessionId: undefined,
      currentData,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.request.summary).toContain("at Ojai Pub");
  });

  it("omits location from summary when not present", async () => {
    const currentData: Partial<WizardState> = {
      partyInfo: makePartyInfo({ location: undefined }),
    };
    const result = await confirmPartyInfoAction({
      db: {} as never,
      userId: "u1",
      sessionId: undefined,
      currentData,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // "at" appears in the time format ("at 9:00 AM") but not as a location
    expect(result.request.summary).not.toMatch(/ at (?![\d])/);
    expect(result.request.summary).not.toContain("at Ojai");
    expect(result.request.summary).not.toContain("at the backyard");
  });
});
