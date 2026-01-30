import { describe, it, expect } from "vitest";
import { getTwilioConfig, isOptOutMessage, OPT_OUT_KEYWORDS } from "./sms";

describe("getTwilioConfig", () => {
  it("returns config when all env vars present", () => {
    const env = {
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token123",
      TWILIO_VERIFY_SERVICE_SID: "VA456",
      TWILIO_PHONE_NUMBER: "+15555551234",
    };

    const config = getTwilioConfig(env);

    expect(config).toEqual({
      accountSid: "AC123",
      authToken: "token123",
      verifyServiceSid: "VA456",
      phoneNumber: "+15555551234",
    });
  });

  it("returns null when TWILIO_ACCOUNT_SID missing", () => {
    const env = {
      TWILIO_AUTH_TOKEN: "token123",
      TWILIO_VERIFY_SERVICE_SID: "VA456",
      TWILIO_PHONE_NUMBER: "+15555551234",
    };

    expect(getTwilioConfig(env)).toBeNull();
  });

  it("returns null when TWILIO_AUTH_TOKEN missing", () => {
    const env = {
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_VERIFY_SERVICE_SID: "VA456",
      TWILIO_PHONE_NUMBER: "+15555551234",
    };

    expect(getTwilioConfig(env)).toBeNull();
  });

  it("returns null when TWILIO_VERIFY_SERVICE_SID missing", () => {
    const env = {
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token123",
      TWILIO_PHONE_NUMBER: "+15555551234",
    };

    expect(getTwilioConfig(env)).toBeNull();
  });

  it("returns null when TWILIO_PHONE_NUMBER missing", () => {
    const env = {
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "token123",
      TWILIO_VERIFY_SERVICE_SID: "VA456",
    };

    expect(getTwilioConfig(env)).toBeNull();
  });

  it("returns null when env is empty", () => {
    expect(getTwilioConfig({})).toBeNull();
  });
});

describe("isOptOutMessage", () => {
  it("recognizes STOP as opt-out", () => {
    expect(isOptOutMessage("STOP")).toBe(true);
  });

  it("recognizes stop (lowercase) as opt-out", () => {
    expect(isOptOutMessage("stop")).toBe(true);
  });

  it("recognizes UNSUBSCRIBE as opt-out", () => {
    expect(isOptOutMessage("UNSUBSCRIBE")).toBe(true);
  });

  it("recognizes CANCEL as opt-out", () => {
    expect(isOptOutMessage("CANCEL")).toBe(true);
  });

  it("recognizes END as opt-out", () => {
    expect(isOptOutMessage("END")).toBe(true);
  });

  it("recognizes QUIT as opt-out", () => {
    expect(isOptOutMessage("QUIT")).toBe(true);
  });

  it("recognizes STOPALL as opt-out", () => {
    expect(isOptOutMessage("STOPALL")).toBe(true);
  });

  it("handles whitespace around keywords", () => {
    expect(isOptOutMessage("  STOP  ")).toBe(true);
    expect(isOptOutMessage("\nSTOP\n")).toBe(true);
  });

  it("rejects non-opt-out messages", () => {
    expect(isOptOutMessage("Hello")).toBe(false);
    expect(isOptOutMessage("STOPPED")).toBe(false);
    expect(isOptOutMessage("Please stop")).toBe(false);
    expect(isOptOutMessage("")).toBe(false);
  });
});

describe("OPT_OUT_KEYWORDS", () => {
  it("contains all standard Twilio opt-out keywords", () => {
    expect(OPT_OUT_KEYWORDS).toContain("STOP");
    expect(OPT_OUT_KEYWORDS).toContain("STOPALL");
    expect(OPT_OUT_KEYWORDS).toContain("UNSUBSCRIBE");
    expect(OPT_OUT_KEYWORDS).toContain("CANCEL");
    expect(OPT_OUT_KEYWORDS).toContain("END");
    expect(OPT_OUT_KEYWORDS).toContain("QUIT");
  });
});
