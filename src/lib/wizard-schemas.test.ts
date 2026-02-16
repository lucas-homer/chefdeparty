import { describe, expect, it } from "vitest";
import { confirmPartyInfoToolSchema } from "./wizard-schemas";

describe("confirmPartyInfoToolSchema", () => {
  it("accepts natural-language date input via dateTimeInput", () => {
    const result = confirmPartyInfoToolSchema.safeParse({
      name: "Sam's 30th",
      dateTimeInput: "this weekend on Saturday at 7pm",
      location: "My place",
    });

    expect(result.success).toBe(true);
  });

  it("accepts deprecated dateTime alias for backwards compatibility", () => {
    const result = confirmPartyInfoToolSchema.safeParse({
      name: "Dinner Party",
      dateTime: "next Saturday at 6pm",
    });

    expect(result.success).toBe(true);
  });

  it("rejects payloads without any date input", () => {
    const result = confirmPartyInfoToolSchema.safeParse({
      name: "Birthday",
    });

    expect(result.success).toBe(false);
  });
});
