import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import {
  users,
  sessions,
  pendingInvites,
  inviteCodes,
  inviteCodeUses,
  phoneVerificationTokens,
} from "../../../drizzle/schema";
import { sendOtpSchema, verifyOtpSchema } from "../../lib/schemas";
import { normalizePhone, isValidPhone } from "../../lib/phone";
import { getTwilioConfig, sendOtp, verifyOtp } from "../../lib/sms";
import { checkOtpRateLimit, getClientIp, resetRateLimit } from "../../lib/rate-limit";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

const phoneAuthRoutes = new Hono<AppContext>()
  // POST /api/phone-auth/send-otp - Send OTP to phone number
  .post("/send-otp", zValidator("json", sendOtpSchema), async (c) => {
    const db = c.get("db");
    const { phone: rawPhone, inviteCode } = c.req.valid("json");

    // Validate and normalize phone number
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return c.json({ error: "Invalid phone number format" }, 400);
    }

    // Get Twilio config
    const twilioConfig = getTwilioConfig(c.env);
    if (!twilioConfig) {
      console.error("Twilio not configured");
      return c.json({ error: "SMS service not configured" }, 503);
    }

    // Check rate limits
    const clientIp = getClientIp(c.req.raw);
    const rateLimit = await checkOtpRateLimit(db, phone, clientIp);
    if (!rateLimit.allowed) {
      return c.json({ error: rateLimit.error }, 429);
    }

    // Check if user exists with this phone
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone));

    // If new user, validate invite code requirement
    if (!existingUser) {
      // Check if admin
      const adminEmails = c.env.ADMIN_EMAILS?.split(",").map((e) => e.trim().toLowerCase()) || [];
      const isAdminPhone = false; // Phone numbers don't bypass invite requirement by default

      if (!isAdminPhone) {
        // New user needs invite code
        if (!inviteCode) {
          return c.json({
            error: "An invite code is required to sign up",
            requiresInvite: true,
          }, 400);
        }

        // Validate invite code
        const [code] = await db
          .select()
          .from(inviteCodes)
          .where(eq(inviteCodes.code, inviteCode.toUpperCase()));

        if (!code) {
          return c.json({ error: "Invalid invite code" }, 400);
        }

        if (code.expiresAt && code.expiresAt < new Date()) {
          return c.json({ error: "Invite code has expired" }, 400);
        }

        if (code.maxUses !== null && code.usedCount !== null && code.usedCount >= code.maxUses) {
          return c.json({ error: "Invite code has been used up" }, 400);
        }

        // Store pending invite
        await db
          .insert(pendingInvites)
          .values({
            phone,
            code: inviteCode.toUpperCase(),
            inviteCodeId: code.id,
          })
          .onConflictDoUpdate({
            target: pendingInvites.phone,
            set: {
              code: inviteCode.toUpperCase(),
              inviteCodeId: code.id,
              createdAt: new Date(),
            },
          });
      }
    }

    // Send OTP via Twilio
    const result = await sendOtp(twilioConfig, phone);
    if (!result.success) {
      return c.json({ error: result.error || "Failed to send verification code" }, 500);
    }

    // Store verification token for tracking
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await db
      .insert(phoneVerificationTokens)
      .values({
        phone,
        twilioSid: result.sid!,
        expires: expiresAt,
      });

    return c.json({
      success: true,
      message: "Verification code sent",
      isNewUser: !existingUser,
    });
  })

  // POST /api/phone-auth/verify-otp - Verify OTP and establish session
  .post("/verify-otp", zValidator("json", verifyOtpSchema), async (c) => {
    const db = c.get("db");
    const { phone: rawPhone, code } = c.req.valid("json");

    // Validate and normalize phone number
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      return c.json({ error: "Invalid phone number format" }, 400);
    }

    // Get Twilio config
    const twilioConfig = getTwilioConfig(c.env);
    if (!twilioConfig) {
      console.error("Twilio not configured");
      return c.json({ error: "SMS service not configured" }, 503);
    }

    // Get verification token
    const [token] = await db
      .select()
      .from(phoneVerificationTokens)
      .where(eq(phoneVerificationTokens.phone, phone))
      .orderBy(phoneVerificationTokens.createdAt);

    if (!token) {
      return c.json({ error: "No verification in progress. Please request a new code." }, 400);
    }

    // Check if expired locally (backup to Twilio's expiration)
    if (token.expires < new Date()) {
      await db
        .delete(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.id, token.id));
      return c.json({ error: "Verification code has expired. Please request a new one." }, 400);
    }

    // Check attempts (prevent brute force)
    if (token.attempts !== null && token.attempts >= 3) {
      await db
        .delete(phoneVerificationTokens)
        .where(eq(phoneVerificationTokens.id, token.id));
      return c.json({ error: "Too many failed attempts. Please request a new code." }, 400);
    }

    // Verify with Twilio
    const result = await verifyOtp(twilioConfig, phone, code);

    if (!result.success) {
      // Increment attempts on failure
      await db
        .update(phoneVerificationTokens)
        .set({ attempts: (token.attempts || 0) + 1 })
        .where(eq(phoneVerificationTokens.id, token.id));

      return c.json({ error: result.error || "Invalid verification code" }, 400);
    }

    // Clean up verification token
    await db
      .delete(phoneVerificationTokens)
      .where(eq(phoneVerificationTokens.id, token.id));

    // Reset rate limits on successful verification
    const clientIp = getClientIp(c.req.raw);
    await resetRateLimit(db, phone, "phone");
    await resetRateLimit(db, clientIp, "ip");

    // Check if user exists
    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone));

    if (!user) {
      // Check for pending invite
      const [pendingInvite] = await db
        .select()
        .from(pendingInvites)
        .where(eq(pendingInvites.phone, phone));

      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          phone,
          phoneVerified: new Date(),
        })
        .returning();

      user = newUser;

      // Record invite code usage if applicable
      if (pendingInvite) {
        await db.insert(inviteCodeUses).values({
          inviteCodeId: pendingInvite.inviteCodeId,
          userId: user.id,
        });

        // Increment usage count
        const [inviteCodeRecord] = await db
          .select()
          .from(inviteCodes)
          .where(eq(inviteCodes.id, pendingInvite.inviteCodeId));

        if (inviteCodeRecord) {
          await db
            .update(inviteCodes)
            .set({ usedCount: (inviteCodeRecord.usedCount || 0) + 1 })
            .where(eq(inviteCodes.id, pendingInvite.inviteCodeId));
        }

        // Clean up pending invite
        await db
          .delete(pendingInvites)
          .where(eq(pendingInvites.phone, phone));
      }
    } else {
      // Update phone verified timestamp
      await db
        .update(users)
        .set({ phoneVerified: new Date() })
        .where(eq(users.id, user.id));
    }

    // Create session (matches Auth.js session format)
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await db.insert(sessions).values({
      sessionToken,
      userId: user.id,
      expires,
    });

    // Set session cookie (matches Auth.js cookie format)
    const isProduction = !c.env.APP_URL?.includes("localhost") && !c.env.APP_URL?.includes("127.0.0.1");
    const cookieName = isProduction ? "__Secure-authjs.session-token" : "authjs.session-token";

    c.header(
      "Set-Cookie",
      `${cookieName}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; ${isProduction ? "Secure; " : ""}Max-Age=${30 * 24 * 60 * 60}`
    );

    return c.json({
      success: true,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
      },
    });
  });

export type PhoneAuthRoutes = typeof phoneAuthRoutes;
export { phoneAuthRoutes };
