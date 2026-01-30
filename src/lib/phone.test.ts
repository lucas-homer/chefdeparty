import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  isValidPhone,
  formatPhoneForDisplay,
  getPhoneCountry,
  parsePhone,
} from "./phone";

describe("normalizePhone", () => {
  it("normalizes US phone number to E.164", () => {
    expect(normalizePhone("(415) 555-1234")).toBe("+14155551234");
    expect(normalizePhone("415-555-1234")).toBe("+14155551234");
    expect(normalizePhone("415.555.1234")).toBe("+14155551234");
    expect(normalizePhone("4155551234")).toBe("+14155551234");
    expect(normalizePhone("+1 415 555 1234")).toBe("+14155551234");
  });

  it("normalizes international phone numbers", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("+33 1 23 45 67 89")).toBe("+33123456789");
  });

  it("returns null for invalid phone numbers", () => {
    expect(normalizePhone("")).toBe(null);
    expect(normalizePhone("   ")).toBe(null);
    expect(normalizePhone("not-a-phone")).toBe(null);
    expect(normalizePhone("123")).toBe(null);
    expect(normalizePhone("555-1234")).toBe(null); // Too short without area code
  });

  it("handles different default countries", () => {
    // UK number without country code
    expect(normalizePhone("020 7946 0958", "GB")).toBe("+442079460958");
  });
});

describe("isValidPhone", () => {
  it("validates US phone numbers", () => {
    expect(isValidPhone("(415) 555-1234")).toBe(true);
    expect(isValidPhone("415-555-1234")).toBe(true);
    expect(isValidPhone("+14155551234")).toBe(true);
  });

  it("validates international phone numbers", () => {
    expect(isValidPhone("+44 20 7946 0958")).toBe(true);
    expect(isValidPhone("+33 1 23 45 67 89")).toBe(true);
  });

  it("rejects invalid phone numbers", () => {
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("not-a-phone")).toBe(false);
    expect(isValidPhone("555-1234")).toBe(false);
  });
});

describe("formatPhoneForDisplay", () => {
  it("formats US numbers in national format", () => {
    expect(formatPhoneForDisplay("+14155551234")).toBe("(415) 555-1234");
    expect(formatPhoneForDisplay("4155551234")).toBe("(415) 555-1234");
  });

  it("formats international numbers in international format for US display", () => {
    expect(formatPhoneForDisplay("+442079460958")).toBe("+44 20 7946 0958");
  });

  it("returns original input for invalid numbers", () => {
    expect(formatPhoneForDisplay("invalid")).toBe("invalid");
    expect(formatPhoneForDisplay("123")).toBe("123");
  });
});

describe("getPhoneCountry", () => {
  it("returns country code for valid numbers", () => {
    expect(getPhoneCountry("+14155551234")).toBe("US");
    expect(getPhoneCountry("+442079460958")).toBe("GB");
    expect(getPhoneCountry("+33123456789")).toBe("FR");
  });

  it("returns null for invalid numbers", () => {
    expect(getPhoneCountry("invalid")).toBe(null);
    expect(getPhoneCountry("")).toBe(null);
  });
});

describe("parsePhone", () => {
  it("parses US phone number", () => {
    const result = parsePhone("+14155551234");
    expect(result).toEqual({
      e164: "+14155551234",
      national: "(415) 555-1234",
      international: "+1 415 555 1234",
      country: "US",
      countryCallingCode: "1",
    });
  });

  it("parses UK phone number", () => {
    const result = parsePhone("+442079460958");
    expect(result).toEqual({
      e164: "+442079460958",
      national: "020 7946 0958",
      international: "+44 20 7946 0958",
      country: "GB",
      countryCallingCode: "44",
    });
  });

  it("returns null for invalid numbers", () => {
    expect(parsePhone("invalid")).toBe(null);
    expect(parsePhone("")).toBe(null);
    expect(parsePhone("123")).toBe(null);
  });
});
