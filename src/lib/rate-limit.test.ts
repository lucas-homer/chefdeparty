import { describe, it, expect } from "vitest";
import {
  OTP_RATE_LIMIT,
  OTP_IP_RATE_LIMIT,
  getClientIp,
} from "./rate-limit";

describe("rate limit configuration", () => {
  it("has correct OTP rate limit config", () => {
    expect(OTP_RATE_LIMIT.maxRequests).toBe(5);
    expect(OTP_RATE_LIMIT.windowSeconds).toBe(3600);
    expect(OTP_RATE_LIMIT.lockoutSeconds).toBe(3600);
  });

  it("has correct IP rate limit config", () => {
    expect(OTP_IP_RATE_LIMIT.maxRequests).toBe(10);
    expect(OTP_IP_RATE_LIMIT.windowSeconds).toBe(3600);
    expect(OTP_IP_RATE_LIMIT.lockoutSeconds).toBe(3600);
  });
});

describe("getClientIp", () => {
  it("extracts IP from CF-Connecting-IP header", () => {
    const request = new Request("https://example.com", {
      headers: {
        "CF-Connecting-IP": "1.2.3.4",
      },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("extracts IP from X-Forwarded-For header", () => {
    const request = new Request("https://example.com", {
      headers: {
        "X-Forwarded-For": "5.6.7.8, 9.10.11.12",
      },
    });
    expect(getClientIp(request)).toBe("5.6.7.8");
  });

  it("extracts IP from X-Real-IP header", () => {
    const request = new Request("https://example.com", {
      headers: {
        "X-Real-IP": "13.14.15.16",
      },
    });
    expect(getClientIp(request)).toBe("13.14.15.16");
  });

  it("prefers CF-Connecting-IP over other headers", () => {
    const request = new Request("https://example.com", {
      headers: {
        "CF-Connecting-IP": "1.2.3.4",
        "X-Forwarded-For": "5.6.7.8",
        "X-Real-IP": "9.10.11.12",
      },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });

  it("returns unknown when no IP headers present", () => {
    const request = new Request("https://example.com");
    expect(getClientIp(request)).toBe("unknown");
  });

  it("handles whitespace in X-Forwarded-For", () => {
    const request = new Request("https://example.com", {
      headers: {
        "X-Forwarded-For": "  1.2.3.4  ,  5.6.7.8  ",
      },
    });
    expect(getClientIp(request)).toBe("1.2.3.4");
  });
});
