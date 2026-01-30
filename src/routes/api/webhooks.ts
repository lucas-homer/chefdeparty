import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { smsOptOuts } from "../../../drizzle/schema";
import { isOptOutMessage, validateTwilioSignature, getTwilioConfig } from "../../lib/sms";
import { normalizePhone } from "../../lib/phone";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

const webhookRoutes = new Hono<AppContext>()
  /**
   * POST /api/webhooks/twilio/sms
   * Receives incoming SMS messages from Twilio
   *
   * Handles:
   * - STOP/UNSUBSCRIBE messages → record opt-out
   * - START/UNSTOP messages → remove opt-out (re-subscribe)
   *
   * Twilio sends these parameters:
   * - From: sender phone number
   * - To: your Twilio number
   * - Body: message text
   * - MessageSid: unique message ID
   */
  .post("/twilio/sms", async (c) => {
    const twilioConfig = getTwilioConfig(c.env);

    // Parse form data from Twilio
    const formData = await c.req.parseBody();
    const from = formData.From as string;
    const body = formData.Body as string;
    const messageSid = formData.MessageSid as string;

    // Validate required fields
    if (!from || !body) {
      console.error("Twilio webhook missing required fields");
      return c.text("Bad Request", 400);
    }

    // Validate Twilio signature in production
    if (twilioConfig && c.env.APP_URL) {
      const signature = c.req.header("X-Twilio-Signature");
      if (signature) {
        const webhookUrl = `${c.env.APP_URL}/api/webhooks/twilio/sms`;
        const params: Record<string, string> = {};
        for (const [key, value] of Object.entries(formData)) {
          if (typeof value === "string") {
            params[key] = value;
          }
        }

        const isValid = await validateTwilioSignature(
          twilioConfig.authToken,
          signature,
          webhookUrl,
          params
        );

        if (!isValid) {
          console.error("Invalid Twilio signature");
          return c.text("Forbidden", 403);
        }
      }
    }

    // Normalize phone number
    const normalizedPhone = normalizePhone(from);
    if (!normalizedPhone) {
      console.error("Could not normalize phone number:", from);
      return c.text("OK", 200); // Still return 200 to Twilio
    }

    const db = c.get("db");
    const messageBody = body.trim().toUpperCase();

    // Handle opt-out keywords
    if (isOptOutMessage(body)) {
      // Record opt-out
      await db
        .insert(smsOptOuts)
        .values({
          phone: normalizedPhone,
          twilioMessageSid: messageSid,
        })
        .onConflictDoUpdate({
          target: smsOptOuts.phone,
          set: {
            optedOutAt: new Date(),
            twilioMessageSid: messageSid,
          },
        });

      console.log(`SMS opt-out recorded for ${normalizedPhone}`);
    }

    // Handle opt-in keywords (START, UNSTOP, etc.)
    // Twilio also handles these automatically, but we track in our DB
    if (["START", "UNSTOP", "YES"].includes(messageBody)) {
      await db.delete(smsOptOuts).where(eq(smsOptOuts.phone, normalizedPhone));
      console.log(`SMS opt-in recorded for ${normalizedPhone}`);
    }

    // Return TwiML response (empty response = no reply)
    // Twilio automatically sends "You have been unsubscribed" for STOP
    return c.text(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      200,
      { "Content-Type": "text/xml" }
    );
  });

export type WebhookRoutes = typeof webhookRoutes;
export { webhookRoutes };
