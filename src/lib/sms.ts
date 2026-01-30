/**
 * Twilio SMS Service
 *
 * Uses Twilio Verify API for OTP verification and Messages API for general SMS.
 * Direct REST API calls for Cloudflare Workers compatibility (no SDK).
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
  phoneNumber: string; // For sending SMS invites
}

export interface SendOtpResult {
  success: boolean;
  sid?: string; // Twilio verification SID
  error?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  status?: "pending" | "approved" | "canceled" | "max_attempts_reached" | "deleted" | "failed" | "expired";
  error?: string;
}

export interface SendSmsResult {
  success: boolean;
  sid?: string; // Twilio message SID
  error?: string;
  optedOut?: boolean; // True if recipient has opted out of SMS
}

/**
 * Send an OTP verification code via Twilio Verify
 * @param config Twilio configuration
 * @param phone Phone number in E.164 format
 * @returns Result with Twilio verification SID
 */
export async function sendOtp(
  config: TwilioConfig,
  phone: string
): Promise<SendOtpResult> {
  const url = `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/Verifications`;

  const auth = btoa(`${config.accountSid}:${config.authToken}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        Channel: "sms",
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("Twilio Verify error:", data);
      return {
        success: false,
        error: data.message || "Failed to send verification code",
      };
    }

    return {
      success: true,
      sid: data.sid,
    };
  } catch (error) {
    console.error("Twilio Verify exception:", error);
    return {
      success: false,
      error: "Failed to connect to SMS service",
    };
  }
}

/**
 * Verify an OTP code via Twilio Verify
 * @param config Twilio configuration
 * @param phone Phone number in E.164 format
 * @param code The 6-digit OTP code
 * @returns Verification result
 */
export async function verifyOtp(
  config: TwilioConfig,
  phone: string,
  code: string
): Promise<VerifyOtpResult> {
  const url = `https://verify.twilio.com/v2/Services/${config.verifyServiceSid}/VerificationCheck`;

  const auth = btoa(`${config.accountSid}:${config.authToken}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: phone,
        Code: code,
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("Twilio Verify Check error:", data);

      // Handle specific error codes
      if (data.code === 20404) {
        return {
          success: false,
          status: "expired",
          error: "Verification code has expired. Please request a new one.",
        };
      }

      return {
        success: false,
        error: data.message || "Failed to verify code",
      };
    }

    const status = data.status as VerifyOtpResult["status"];

    return {
      success: status === "approved",
      status,
      error: status !== "approved" ? "Invalid verification code" : undefined,
    };
  } catch (error) {
    console.error("Twilio Verify Check exception:", error);
    return {
      success: false,
      error: "Failed to connect to SMS service",
    };
  }
}

/**
 * Send an SMS message via Twilio Messages API
 * Used for sending party invitations
 * @param config Twilio configuration
 * @param to Recipient phone number in E.164 format
 * @param body Message text
 * @returns Send result
 */
export async function sendSms(
  config: TwilioConfig,
  to: string,
  body: string
): Promise<SendSmsResult> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

  const auth = btoa(`${config.accountSid}:${config.authToken}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: config.phoneNumber,
        To: to,
        Body: body,
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      console.error("Twilio Messages error:", data);

      // Handle opt-out error (21610: Attempt to send to unsubscribed recipient)
      if (data.code === 21610) {
        return {
          success: false,
          optedOut: true,
          error: "This number has opted out of SMS messages",
        };
      }

      return {
        success: false,
        error: data.message || "Failed to send SMS",
      };
    }

    return {
      success: true,
      sid: data.sid,
    };
  } catch (error) {
    console.error("Twilio Messages exception:", error);
    return {
      success: false,
      error: "Failed to connect to SMS service",
    };
  }
}

/**
 * Send a party invitation SMS
 * @param config Twilio configuration
 * @param to Recipient phone number
 * @param partyName Name of the party
 * @param hostName Name of the host
 * @param inviteUrl URL for RSVP
 * @returns Send result
 */
export async function sendInviteSms(
  config: TwilioConfig,
  to: string,
  partyName: string,
  hostName: string | null,
  inviteUrl: string
): Promise<SendSmsResult> {
  const host = hostName || "Someone";
  const body = `${host} invited you to ${partyName}! RSVP: ${inviteUrl}\n\nReply STOP to opt out. Msg & data rates may apply.`;

  return sendSms(config, to, body);
}

/**
 * Get Twilio config from environment variables
 */
export function getTwilioConfig(env: {
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
  TWILIO_PHONE_NUMBER?: string;
}): TwilioConfig | null {
  if (
    !env.TWILIO_ACCOUNT_SID ||
    !env.TWILIO_AUTH_TOKEN ||
    !env.TWILIO_VERIFY_SERVICE_SID ||
    !env.TWILIO_PHONE_NUMBER
  ) {
    return null;
  }

  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    verifyServiceSid: env.TWILIO_VERIFY_SERVICE_SID,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
  };
}

// ============================================
// SMS Opt-Out Management
// ============================================

// Keywords that Twilio recognizes as opt-out requests
export const OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];

/**
 * Check if a message body contains an opt-out keyword
 */
export function isOptOutMessage(body: string): boolean {
  const normalized = body.trim().toUpperCase();
  return OPT_OUT_KEYWORDS.includes(normalized);
}

/**
 * Validate Twilio webhook signature
 * @param authToken Twilio auth token
 * @param signature X-Twilio-Signature header value
 * @param url Full webhook URL
 * @param params Request body parameters
 */
export async function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  // Sort params alphabetically and concatenate
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");

  const data = url + sortedParams;

  // Create HMAC-SHA1 signature
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data)
  );

  // Convert to base64
  const computedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer))
  );

  return computedSignature === signature;
}
