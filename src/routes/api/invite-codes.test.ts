import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock browser-dependent auth packages to avoid navigator error in Node
vi.mock("@hono/auth-js", () => ({
  authHandler: () => async (_c: any, next: any) => next(),
  initAuthConfig: () => async (_c: any, next: any) => next(),
  verifyAuth: () => async (_c: any, next: any) => next(),
}));
vi.mock("@auth/core/providers/google", () => ({ default: () => ({}) }));
vi.mock("@auth/core/providers/resend", () => ({ default: () => ({}) }));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => ({}) }));

import { createTestClient } from "@/test/helpers/hono-test-client";
import { testUsers } from "@/test/mocks/auth";
import { createMockDb } from "@/test/helpers/mock-db";
import { inviteCodesRoutes } from "./invite-codes";

describe("Invite Codes API", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  // ==================== POST /validate (Public) ====================

  describe("POST /validate - Validate invite code", () => {
    it("returns invalid for unknown code", async () => {
      mockDb.setSelectResult([]);
      const { post } = createTestClient({ routes: inviteCodesRoutes, user: null, db: mockDb.db });

      const res = await post("/validate", { code: "BADCODE1", email: "new@test.com" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("Invalid invite code");
    });

    it("returns invalid for expired code", async () => {
      mockDb.setSelectResult([{
        id: "ic1", code: "EXPIRED1", expiresAt: new Date("2020-01-01"), maxUses: 10, usedCount: 0,
      }]);
      const { post } = createTestClient({ routes: inviteCodesRoutes, user: null, db: mockDb.db });

      const res = await post("/validate", { code: "EXPIRED1", email: "new@test.com" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("expired");
    });

    it("returns invalid for fully used code", async () => {
      mockDb.setSelectResult([{
        id: "ic2", code: "USEDUP11", expiresAt: null, maxUses: 1, usedCount: 1,
      }]);
      const { post } = createTestClient({ routes: inviteCodesRoutes, user: null, db: mockDb.db });

      const res = await post("/validate", { code: "USEDUP11", email: "new@test.com" });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("usage limit");
    });

    it("returns valid for good code and stores pending invite", async () => {
      mockDb.setSelectResult([{
        id: "ic3", code: "GOODCODE", expiresAt: new Date("2030-01-01"), maxUses: 10, usedCount: 2,
      }]);
      const { post } = createTestClient({ routes: inviteCodesRoutes, user: null, db: mockDb.db });

      const res = await post("/validate", { code: "goodcode", email: "new@test.com" });
      expect(res.status).toBe(200);
      expect((await res.json()).valid).toBe(true);
      expect(mockDb.getCalls("insert")).toHaveLength(1);
    });
  });

  // ==================== GET / (Admin Only) ====================

  describe("GET / - List invite codes", () => {
    it("returns 401 for unauthenticated request", async () => {
      const { request } = createTestClient({ routes: inviteCodesRoutes, user: null, db: mockDb.db });
      expect((await request("/")).status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      const { request } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await request("/")).status).toBe(403);
    });

    it("returns codes for admin user", async () => {
      mockDb.setSelectResult([
        { id: "ic1", code: "CODE1111", maxUses: 5 },
        { id: "ic2", code: "CODE2222", maxUses: 1 },
      ]);
      const { request } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.admin, db: mockDb.db });

      const res = await request("/");
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveLength(2);
    });
  });

  // ==================== POST / (Admin Only) ====================

  describe("POST / - Create invite code", () => {
    it("returns 403 for non-admin user", async () => {
      const { post } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await post("/", { maxUses: 5 })).status).toBe(403);
    });

    it("creates code for admin user", async () => {
      mockDb.setInsertResult([{ id: "ic-new", code: "NEWCODE1", maxUses: 5 }]);
      const { post } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.admin, db: mockDb.db });

      const res = await post("/", { maxUses: 5, note: "For friends" });
      expect(res.status).toBe(201);
      expect((await res.json()).code).toBe("NEWCODE1");
    });
  });

  // ==================== DELETE /:id (Admin Only) ====================

  describe("DELETE /:id - Delete invite code", () => {
    it("returns 403 for non-admin user", async () => {
      const { delete: del } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await del("/ic1")).status).toBe(403);
    });

    it("returns 404 when code not found", async () => {
      mockDb.setDeleteResults([], []);
      const { delete: del } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.admin, db: mockDb.db });
      expect((await del("/nonexistent")).status).toBe(404);
    });

    it("deletes code and associated uses", async () => {
      mockDb.setDeleteResults([], [{ id: "ic1" }]);
      const { delete: del } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.admin, db: mockDb.db });

      const res = await del("/ic1");
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
      expect(mockDb.getCalls("delete")).toHaveLength(2);
    });
  });

  // ==================== GET /:id/uses (Admin Only) ====================

  describe("GET /:id/uses - Usage history", () => {
    it("returns 403 for non-admin user", async () => {
      const { request } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.host, db: mockDb.db });
      expect((await request("/ic1/uses")).status).toBe(403);
    });

    it("returns usage history for admin", async () => {
      mockDb.setSelectResult([{ id: "u1", usedAt: new Date(), userEmail: "user1@test.com" }]);
      const { request } = createTestClient({ routes: inviteCodesRoutes, user: testUsers.admin, db: mockDb.db });

      const res = await request("/ic1/uses");
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveLength(1);
    });
  });
});
