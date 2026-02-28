import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createMockDb } from "@/test/helpers/mock-db";
import { createMockEnv } from "@/test/mocks/env";
import { webhookRoutes } from "./webhooks";
import type { Env } from "@/index";
import type { Database } from "@/lib/db";

// webhooks.ts does NOT import hono-auth, so no auth mock needed

type Variables = { db: Database };
type AppContext = { Bindings: Env; Variables: Variables };

function createWebhookTestApp(mockDb: ReturnType<typeof createMockDb>) {
  const mockEnv = createMockEnv();

  const app = new Hono<AppContext>()
    .use("*", async (c, next) => {
      c.set("db", mockDb.db);
      await next();
    })
    .route("/", webhookRoutes);

  async function postTwilioSms(params: Record<string, string>): Promise<Response> {
    const body = new URLSearchParams(params);
    return app.fetch(
      new Request("http://localhost/twilio/sms", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
      mockEnv
    );
  }

  return { app, postTwilioSms };
}

describe("Webhooks API", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  describe("POST /twilio/sms - Twilio SMS webhook", () => {
    it("returns 400 when required fields are missing", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);
      const res = await postTwilioSms({});
      expect(res.status).toBe(400);
    });

    it("returns 200 for opt-out message (STOP)", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);

      const res = await postTwilioSms({ From: "+12025551234", Body: "STOP", MessageSid: "SM123" });
      expect(res.status).toBe(200);

      const text = await res.text();
      expect(text).toContain("<Response>");
      // STOP triggers insert (opt-out)
      expect(mockDb.getCalls("insert")).toHaveLength(1);
    });

    it("returns 200 for opt-out keyword UNSUBSCRIBE", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);

      const res = await postTwilioSms({ From: "+12025551234", Body: "UNSUBSCRIBE", MessageSid: "SM124" });
      expect(res.status).toBe(200);
      // UNSUBSCRIBE also triggers insert (opt-out)
      expect(mockDb.getCalls("insert")).toHaveLength(1);
    });

    it("handles opt-in message (START) by removing opt-out", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);

      const res = await postTwilioSms({ From: "+12025551234", Body: "START", MessageSid: "SM125" });
      expect(res.status).toBe(200);
      // START triggers delete (remove opt-out)
      expect(mockDb.getCalls("delete")).toHaveLength(1);
    });

    it("handles YES as opt-in keyword", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);

      const res = await postTwilioSms({ From: "+12025551234", Body: "YES", MessageSid: "SM126" });
      expect(res.status).toBe(200);
      expect(mockDb.getCalls("delete")).toHaveLength(1);
    });

    it("returns 200 for non-opt-out messages without recording", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);

      const res = await postTwilioSms({ From: "+12025551234", Body: "Hello, thanks!", MessageSid: "SM127" });
      expect(res.status).toBe(200);
      expect(mockDb.getCalls("insert")).toHaveLength(0);
      expect(mockDb.getCalls("delete")).toHaveLength(0);
    });

    it("returns TwiML response", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);

      const res = await postTwilioSms({ From: "+12025551234", Body: "Random message", MessageSid: "SM128" });
      expect(res.status).toBe(200);

      const text = await res.text();
      expect(text).toBe('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
      expect(res.headers.get("Content-Type")).toContain("text/xml");
    });

    it("returns 200 but no DB ops for un-normalizable phone", async () => {
      const { postTwilioSms } = createWebhookTestApp(mockDb);

      const res = await postTwilioSms({ From: "not-a-phone", Body: "STOP", MessageSid: "SM129" });
      // Returns 200 to Twilio even if phone can't be normalized
      expect(res.status).toBe(200);
      // No DB operations since phone normalization failed
      expect(mockDb.getCalls("insert")).toHaveLength(0);
    });
  });
});
