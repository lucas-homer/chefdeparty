import { describe, expect, it } from "vitest";
import {
  createPhoneAuthPlaceholderEmail,
  isPhoneAuthPlaceholderEmail,
  sanitizeAuthEmail,
} from "./auth-email";

describe("createPhoneAuthPlaceholderEmail", () => {
  it("creates a deterministic placeholder email from a phone number", () => {
    expect(createPhoneAuthPlaceholderEmail("+1 (415) 555-1234"))
      .toBe("phone-14155551234@phone-auth.invalid");
  });
});

describe("isPhoneAuthPlaceholderEmail", () => {
  it("returns true for placeholder emails", () => {
    expect(isPhoneAuthPlaceholderEmail("phone-14155551234@phone-auth.invalid")).toBe(true);
  });

  it("returns false for non-placeholder emails", () => {
    expect(isPhoneAuthPlaceholderEmail("host@test.com")).toBe(false);
    expect(isPhoneAuthPlaceholderEmail(null)).toBe(false);
    expect(isPhoneAuthPlaceholderEmail(undefined)).toBe(false);
  });
});

describe("sanitizeAuthEmail", () => {
  it("returns null for placeholder emails", () => {
    expect(sanitizeAuthEmail("phone-14155551234@phone-auth.invalid")).toBe(null);
  });

  it("returns original email for normal emails", () => {
    expect(sanitizeAuthEmail("host@test.com")).toBe("host@test.com");
  });

  it("returns null for empty values", () => {
    expect(sanitizeAuthEmail(null)).toBe(null);
    expect(sanitizeAuthEmail(undefined)).toBe(null);
  });
});
