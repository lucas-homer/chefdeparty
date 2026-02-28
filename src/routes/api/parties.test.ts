import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock browser-dependent packages to avoid navigator error in Node env
vi.mock("@hono/auth-js", () => ({
  authHandler: () => async (_c: any, next: any) => next(),
  initAuthConfig: () => async (_c: any, next: any) => next(),
  verifyAuth: () => async (_c: any, next: any) => next(),
}));
vi.mock("@auth/core/providers/google", () => ({ default: () => ({}) }));
vi.mock("@auth/core/providers/resend", () => ({ default: () => ({}) }));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => ({}) }));
vi.mock("../../lib/ai", () => ({ createAI: () => ({ defaultModel: {} }) }));

import { createTestClient } from "@/test/helpers/hono-test-client";
import { testUsers } from "@/test/mocks/auth";
import { createMockDb } from "@/test/helpers/mock-db";
import { partiesRoutes } from "./parties";

describe("Parties API", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  // ==================== AUTH ====================

  describe("authentication", () => {
    it("returns 401 for unauthenticated GET /", async () => {
      const { request } = createTestClient({ routes: partiesRoutes, user: null, db: mockDb.db });
      const res = await request("/");
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated POST /", async () => {
      const { post } = createTestClient({ routes: partiesRoutes, user: null, db: mockDb.db });
      const res = await post("/", { name: "Test Party" });
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated DELETE /:id", async () => {
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: null, db: mockDb.db });
      const res = await del("/party-1");
      expect(res.status).toBe(401);
    });
  });

  // ==================== GET / ====================

  describe("GET / - List parties", () => {
    it("returns empty array when user has no parties", async () => {
      mockDb.setSelectResult([]);
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("returns list of user parties", async () => {
      mockDb.setSelectResult([
        { id: "p1", name: "BBQ", hostId: testUsers.host.id },
        { id: "p2", name: "Dinner", hostId: testUsers.host.id },
      ]);
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe("BBQ");
    });
  });

  // ==================== GET /:id ====================

  describe("GET /:id - Get party", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/nonexistent");
      expect(res.status).toBe(404);
    });

    it("returns party when found", async () => {
      mockDb.setSelectResult([{ id: "p1", name: "BBQ", hostId: testUsers.host.id }]);
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/p1");
      expect(res.status).toBe(200);
      expect((await res.json()).name).toBe("BBQ");
    });
  });

  // ==================== POST / ====================

  describe("POST / - Create party", () => {
    it("returns 400 when name is missing", async () => {
      const { post } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      const res = await post("/", { dateTime: "2025-07-04T18:00:00Z" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Party name is required");
    });

    it("creates a party and returns 201", async () => {
      const newParty = { id: "p-new", name: "Summer BBQ", hostId: testUsers.host.id };
      mockDb.setInsertResult([newParty]);
      const { post } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await post("/", { name: "Summer BBQ", dateTime: "2025-07-04T18:00:00Z" });
      expect(res.status).toBe(201);
      expect((await res.json()).name).toBe("Summer BBQ");
    });
  });

  // ==================== DELETE /:id ====================

  describe("DELETE /:id - Delete party", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setDeleteResult([]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/nonexistent");
      expect(res.status).toBe(404);
    });

    it("deletes party and returns success", async () => {
      mockDb.setDeleteResult([{ id: "p1" }]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/p1");
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  });

  // ==================== GUESTS ====================

  describe("GET /:id/guests - List guests", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await request("/p1/guests")).status).toBe(404);
    });

    it("returns guest list for owned party", async () => {
      mockDb.setSelectResults(
        [{ id: "p1", hostId: testUsers.host.id }],
        [{ id: "g1", name: "Alice" }, { id: "g2", name: "Bob" }]
      );
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/p1/guests");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.partyId).toBe("p1");
      expect(data.guests).toHaveLength(2);
    });
  });

  describe("DELETE /:id/guests/:guestId - Remove guest", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await del("/p1/guests/g1")).status).toBe(404);
    });

    it("returns 404 when guest not found", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      mockDb.setDeleteResult([]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await del("/p1/guests/nonexistent")).status).toBe(404);
    });

    it("deletes guest and returns success", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      mockDb.setDeleteResult([{ id: "g1" }]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/p1/guests/g1");
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  });

  // ==================== MENU ====================

  describe("GET /:id/menu - List menu", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await request("/p1/menu")).status).toBe(404);
    });

    it("returns menu items for owned party", async () => {
      mockDb.setSelectResults(
        [{ id: "p1", hostId: testUsers.host.id }],
        [{ id: "m1", recipeId: "r1", recipe: { name: "Pasta" } }]
      );
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/p1/menu");
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveLength(1);
    });
  });

  describe("DELETE /:id/menu/:menuItemId - Remove menu item", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await del("/p1/menu/m1")).status).toBe(404);
    });

    it("returns 404 when menu item not found", async () => {
      mockDb.setSelectResults([{ id: "p1", hostId: testUsers.host.id }], []);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await del("/p1/menu/nonexistent")).status).toBe(404);
    });

    it("deletes menu item, timeline tasks, and recipe copy", async () => {
      mockDb.setSelectResults(
        [{ id: "p1", hostId: testUsers.host.id }],
        [{ id: "m1", partyId: "p1", recipeId: "r-copy" }]
      );
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/p1/menu/m1");
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      // 3 deletes: partyMenu, timelineTasks, recipes
      expect(mockDb.getCalls("delete")).toHaveLength(3);
    });
  });

  // ==================== TIMELINE ====================

  describe("GET /:id/timeline - List timeline", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await request("/p1/timeline")).status).toBe(404);
    });

    it("returns timeline tasks", async () => {
      mockDb.setSelectResults(
        [{ id: "p1", name: "BBQ", hostId: testUsers.host.id, dateTime: new Date() }],
        [{ id: "t1", description: "Prep chicken" }]
      );
      const { request } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/p1/timeline");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.partyId).toBe("p1");
      expect(data.tasks).toHaveLength(1);
    });
  });

  describe("POST /:id/timeline - Create task", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { post } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await post("/p1/timeline", { description: "Test", scheduledDate: "2025-07-04" })).status).toBe(404);
    });

    it("returns 400 when description is missing", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      const { post } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await post("/p1/timeline", { scheduledDate: "2025-07-04" })).status).toBe(400);
    });

    it("creates timeline task and returns 201", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      mockDb.setInsertResult([{ id: "t-new", description: "Set table", partyId: "p1" }]);
      const { post } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await post("/p1/timeline", { description: "Set table", scheduledDate: "2025-07-04" });
      expect(res.status).toBe(201);
      expect((await res.json()).description).toBe("Set table");
    });
  });

  describe("DELETE /:id/timeline - Delete all tasks", () => {
    it("returns 404 when party not found", async () => {
      mockDb.setSelectResult([]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await del("/p1/timeline")).status).toBe(404);
    });

    it("deletes all tasks and returns success", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/p1/timeline");
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  });

  // ==================== CONTRIBUTIONS ====================

  describe("POST /:id/contributions - Add contribution", () => {
    it("returns 400 when description is missing", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      const { post } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await post("/p1/contributions", {});
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("Description is required");
    });

    it("creates contribution item and returns 201", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      mockDb.setInsertResult([{ id: "c-new", description: "Bring dessert", partyId: "p1" }]);
      const { post } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await post("/p1/contributions", { description: "Bring dessert" });
      expect(res.status).toBe(201);
      expect((await res.json()).description).toBe("Bring dessert");
    });
  });

  describe("DELETE /:id/contributions/:itemId - Delete contribution", () => {
    it("returns 404 when item not found", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      mockDb.setDeleteResult([]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await del("/p1/contributions/nonexistent")).status).toBe(404);
    });

    it("deletes contribution and returns success", async () => {
      mockDb.setSelectResult([{ id: "p1", hostId: testUsers.host.id }]);
      mockDb.setDeleteResult([{ id: "c1" }]);
      const { delete: del } = createTestClient({ routes: partiesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/p1/contributions/c1");
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  });
});
