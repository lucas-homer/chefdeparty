import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createMockDb } from "@/test/helpers/mock-db";
import { createMockEnv } from "@/test/mocks/env";
import { inviteRoutes } from "./invite";
import type { Env } from "@/index";
import type { Database } from "@/lib/db";

// invite.ts does NOT import hono-auth, so no auth mock needed

type Variables = { db: Database };
type AppContext = { Bindings: Env; Variables: Variables };

function createInviteTestApp(mockDb: ReturnType<typeof createMockDb>) {
  const mockEnv = createMockEnv();

  const app = new Hono<AppContext>()
    .use("*", async (c, next) => {
      c.set("db", mockDb.db);
      await next();
    })
    .route("/", inviteRoutes);

  async function request(path: string, init?: RequestInit): Promise<Response> {
    const url = new URL(path, "http://localhost");
    return app.fetch(new Request(url.toString(), {
      headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
      ...init,
    }), mockEnv);
  }

  async function post(path: string, body: unknown): Promise<Response> {
    return request(path, { method: "POST", body: JSON.stringify(body) });
  }

  return { app, request, post };
}

describe("Invite API", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  // ==================== Guest-Specific Token Routes ====================

  describe("GET /g/:guestToken - Get party by guest token", () => {
    it("returns 404 when guest token not found", async () => {
      mockDb.setSelectResult([]);
      const { request } = createInviteTestApp(mockDb);
      expect((await request("/g/invalid-token")).status).toBe(404);
    });

    it("returns 404 when party not found for guest", async () => {
      mockDb.setSelectResults(
        [{ id: "g1", partyId: "p1", guestToken: "tok123" }],
        []
      );
      const { request } = createInviteTestApp(mockDb);
      expect((await request("/g/tok123")).status).toBe(404);
    });

    it("returns party info and guest details", async () => {
      mockDb.setSelectResults(
        [{ id: "g1", partyId: "p1", guestToken: "tok123", name: "Alice", email: "alice@test.com", phone: null }],
        [{ id: "p1", name: "BBQ", description: "Summer BBQ", dateTime: new Date(), location: "Backyard" }],
        [{ id: "c1", description: "Bring chips", claimedByGuestId: null }]
      );
      const { request } = createInviteTestApp(mockDb);

      const res = await request("/g/tok123");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.party.name).toBe("BBQ");
      expect(data.guest.name).toBe("Alice");
      expect(data.contributions).toHaveLength(1);
    });
  });

  describe("POST /g/:guestToken - RSVP via guest token", () => {
    it("returns 404 when guest token not found", async () => {
      mockDb.setSelectResult([]);
      const { post } = createInviteTestApp(mockDb);
      expect((await post("/g/invalid-token", { name: "Alice", rsvpStatus: "yes" })).status).toBe(404);
    });

    it("returns 400 when name is missing", async () => {
      mockDb.setSelectResults(
        [{ id: "g1", partyId: "p1", guestToken: "tok123" }],
        [{ id: "p1", name: "BBQ" }]
      );
      const { post } = createInviteTestApp(mockDb);
      expect((await post("/g/tok123", { rsvpStatus: "yes" })).status).toBe(400);
    });

    it("updates guest RSVP and returns success", async () => {
      const updatedGuest = { id: "g1", name: "Alice", email: "alice@test.com", rsvpStatus: "yes", headcount: 2 };
      mockDb.setSelectResults(
        [{ id: "g1", partyId: "p1", guestToken: "tok123", email: "alice@test.com" }],
        [{ id: "p1", name: "BBQ" }]
      );
      mockDb.setUpdateResult([updatedGuest]);
      const { post } = createInviteTestApp(mockDb);

      const res = await post("/g/tok123", { name: "Alice", rsvpStatus: "yes", headcount: 2 });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.guest.rsvpStatus).toBe("yes");
    });
  });

  // ==================== Generic Share Link Routes ====================

  describe("GET /:token - Get party by share token", () => {
    it("returns 404 when share token not found", async () => {
      mockDb.setSelectResult([]);
      const { request } = createInviteTestApp(mockDb);
      expect((await request("/invalid-token")).status).toBe(404);
    });

    it("returns party info and contributions", async () => {
      mockDb.setSelectResults(
        [{ id: "p1", name: "Dinner Party", description: "Formal dinner", dateTime: new Date(), location: "123 Main" }],
        [{ id: "c1", description: "Wine", claimedByGuestId: null }, { id: "c2", description: "Dessert", claimedByGuestId: "g1" }]
      );
      const { request } = createInviteTestApp(mockDb);

      const res = await request("/abc12345");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.party.name).toBe("Dinner Party");
      expect(data.contributions).toHaveLength(2);
    });
  });

  describe("POST /:token - RSVP via share token", () => {
    it("returns 404 when share token not found", async () => {
      mockDb.setSelectResult([]);
      const { post } = createInviteTestApp(mockDb);
      expect((await post("/invalid-token", { name: "Bob", email: "bob@test.com", rsvpStatus: "yes" })).status).toBe(404);
    });

    it("returns 400 when name or rsvpStatus is missing", async () => {
      mockDb.setSelectResult([{ id: "p1", shareToken: "abc12345" }]);
      const { post } = createInviteTestApp(mockDb);
      expect((await post("/abc12345", { email: "bob@test.com" })).status).toBe(400);
    });

    it("returns 400 when neither email nor phone is provided", async () => {
      mockDb.setSelectResult([{ id: "p1", shareToken: "abc12345" }]);
      const { post } = createInviteTestApp(mockDb);

      const res = await post("/abc12345", { name: "Bob", rsvpStatus: "yes" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("email or phone");
    });

    it("creates new guest for share-link RSVP", async () => {
      const newGuest = { id: "g-new", name: "Bob", email: "bob@test.com", rsvpStatus: "yes", headcount: 1 };
      // 1st select = find party, 2nd = check existing by email (empty)
      mockDb.setSelectResults([{ id: "p1", shareToken: "abc12345" }], []);
      mockDb.setInsertResult([newGuest]);
      const { post } = createInviteTestApp(mockDb);

      const res = await post("/abc12345", { name: "Bob", email: "bob@test.com", rsvpStatus: "yes" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.guest.name).toBe("Bob");
    });

    it("updates existing guest on duplicate email RSVP", async () => {
      const existingGuest = { id: "g1", name: "Bob Old", email: "bob@test.com", rsvpStatus: "pending" };
      const updatedGuest = { id: "g1", name: "Bob", email: "bob@test.com", rsvpStatus: "yes", headcount: 2 };
      // 1st select = find party, 2nd = find existing guest by email
      mockDb.setSelectResults([{ id: "p1", shareToken: "abc12345" }], [existingGuest]);
      mockDb.setUpdateResult([updatedGuest]);
      const { post } = createInviteTestApp(mockDb);

      const res = await post("/abc12345", { name: "Bob", email: "bob@test.com", rsvpStatus: "yes", headcount: 2 });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.guest.rsvpStatus).toBe("yes");
      expect(data.guest.headcount).toBe(2);
    });
  });
});
