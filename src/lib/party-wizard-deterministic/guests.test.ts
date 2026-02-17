import { describe, expect, it } from "vitest";
import { resolveDeterministicGuestsTurn } from "./guests";

describe("resolveDeterministicGuestsTurn", () => {
  it("extracts multiline guest entries", () => {
    const result = resolveDeterministicGuestsTurn({
      text: "Amy - amy@gmail.com\nBob - bob@test.com",
      currentData: { guestList: [] },
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("add-guests");
    expect(result.actions).toEqual([
      { type: "add-guest", payload: { name: "Amy", email: "amy@gmail.com", phone: undefined } },
      { type: "add-guest", payload: { name: "Bob", email: "bob@test.com", phone: undefined } },
    ]);
  });

  it("extracts standalone emails", () => {
    const result = resolveDeterministicGuestsTurn({
      text: "invite amy@gmail.com, bob@test.com",
      currentData: { guestList: [] },
    });

    expect(result.handled).toBe(true);
    if (!result.handled) return;

    expect(result.intent).toBe("add-guests");
    expect(result.actions.length).toBe(2);
  });

  it("removes by 1-based index", () => {
    const result = resolveDeterministicGuestsTurn({
      text: "remove #2",
      currentData: {
        guestList: [
          { name: "Amy", email: "amy@gmail.com", phone: undefined },
          { name: "Bob", email: "bob@test.com", phone: undefined },
        ],
      },
    });

    expect(result).toMatchObject({
      handled: true,
      intent: "remove-guest",
      actions: [{ type: "remove-guest", payload: { index: 1 } }],
    });
  });

  it("removes by unique name match", () => {
    const result = resolveDeterministicGuestsTurn({
      text: "remove Amy",
      currentData: {
        guestList: [
          { name: "Amy", email: "amy@gmail.com", phone: undefined },
          { name: "Bob", email: "bob@test.com", phone: undefined },
        ],
      },
    });

    expect(result).toMatchObject({
      handled: true,
      intent: "remove-guest",
      actions: [{ type: "remove-guest", payload: { index: 0 } }],
    });
  });

  it("asks for clarification on ambiguous remove", () => {
    const result = resolveDeterministicGuestsTurn({
      text: "remove Amy",
      currentData: {
        guestList: [
          { name: "Amy", email: "amy1@gmail.com", phone: undefined },
          { name: "Amy", email: "amy2@gmail.com", phone: undefined },
        ],
      },
    });

    expect(result).toMatchObject({
      handled: true,
      intent: "ask-guest-clarification",
    });
  });

  it("handles done intent with confirm action", () => {
    const result = resolveDeterministicGuestsTurn({
      text: "no more",
      currentData: { guestList: [] },
    });

    expect(result).toMatchObject({
      handled: true,
      intent: "confirm-guest-list",
      actions: [{ type: "confirm-guest-list", payload: {} }],
    });
  });

  it("treats plain 'no' as done intent", () => {
    const result = resolveDeterministicGuestsTurn({
      text: "no",
      currentData: { guestList: [] },
    });

    expect(result).toMatchObject({
      handled: true,
      intent: "confirm-guest-list",
      actions: [{ type: "confirm-guest-list", payload: {} }],
    });
  });
});
