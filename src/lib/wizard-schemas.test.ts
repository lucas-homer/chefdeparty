import { describe, expect, it } from "vitest";
import { addGuestToolSchema, updatePartyInfoToolSchema, confirmPartyInfoToolSchema, guestDataSchema } from "./wizard-schemas";

describe("updatePartyInfoToolSchema", () => {
  it("accepts all fields", () => {
    const result = updatePartyInfoToolSchema.safeParse({
      name: "Sam's 30th",
      dateTimeInput: "this weekend on Saturday at 7pm",
      location: "My place",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a single field (name only)", () => {
    const result = updatePartyInfoToolSchema.safeParse({
      name: "Summer BBQ",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a single field (dateTimeInput only)", () => {
    const result = updatePartyInfoToolSchema.safeParse({
      dateTimeInput: "3pm",
    });

    expect(result.success).toBe(true);
  });

  it("accepts an empty object", () => {
    const result = updatePartyInfoToolSchema.safeParse({});

    expect(result.success).toBe(true);
  });
});

describe("confirmPartyInfoToolSchema", () => {
  it("accepts empty object (zero-arg confirmation)", () => {
    const result = confirmPartyInfoToolSchema.safeParse({});

    expect(result.success).toBe(true);
  });
});

describe("addGuestToolSchema", () => {
  it("accepts a name-only guest", () => {
    const result = addGuestToolSchema.safeParse({
      name: "Alice",
    });

    expect(result.success).toBe(true);
  });

  it("does not reject non-email strings in email field", () => {
    const result = addGuestToolSchema.safeParse({
      email: "Alice",
    });

    expect(result.success).toBe(true);
  });
});

describe("guestDataSchema", () => {
  it("accepts name-only guests for wizard flow", () => {
    const result = guestDataSchema.safeParse({
      name: "Chelsea",
    });

    expect(result.success).toBe(true);
  });

  it("rejects completely empty guest entries", () => {
    const result = guestDataSchema.safeParse({});

    expect(result.success).toBe(false);
  });
});
