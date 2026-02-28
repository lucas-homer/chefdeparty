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
import { recipesRoutes } from "./recipes";

const sampleRecipe = {
  id: "r1",
  name: "Pasta Carbonara",
  description: "Classic Italian pasta",
  ownerId: testUsers.host.id,
  sourceType: "manual",
  ingredients: [{ amount: "200", unit: "g", ingredient: "spaghetti" }],
  instructions: [{ step: 1, description: "Boil pasta" }],
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  servings: 4,
  tags: ["italian"],
  dietaryTags: [],
};

describe("Recipes API", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
  });

  // ==================== AUTH ====================

  describe("authentication", () => {
    it("returns 401 for unauthenticated GET /", async () => {
      const { request } = createTestClient({ routes: recipesRoutes, user: null, db: mockDb.db });
      const res = await request("/");
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated POST /", async () => {
      const { post } = createTestClient({ routes: recipesRoutes, user: null, db: mockDb.db });
      const res = await post("/", { name: "Test" });
      expect(res.status).toBe(401);
    });

    it("returns 401 for unauthenticated DELETE /:id", async () => {
      const { delete: del } = createTestClient({ routes: recipesRoutes, user: null, db: mockDb.db });
      const res = await del("/r1");
      expect(res.status).toBe(401);
    });
  });

  // ==================== GET / ====================

  describe("GET / - List recipes", () => {
    it("returns empty array when user has no recipes", async () => {
      mockDb.setSelectResult([]);
      const { request } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("returns list of user recipes", async () => {
      mockDb.setSelectResult([
        sampleRecipe,
        { ...sampleRecipe, id: "r2", name: "Grilled Chicken" },
      ]);
      const { request } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe("Pasta Carbonara");
    });
  });

  // ==================== GET /:id ====================

  describe("GET /:id - Get recipe", () => {
    it("returns 404 when recipe not found", async () => {
      mockDb.setSelectResult([]);
      const { request } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/nonexistent");
      expect(res.status).toBe(404);
    });

    it("returns recipe when found", async () => {
      mockDb.setSelectResult([sampleRecipe]);
      const { request } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await request("/r1");
      expect(res.status).toBe(200);
      expect((await res.json()).name).toBe("Pasta Carbonara");
    });
  });

  // ==================== POST / ====================

  describe("POST / - Create recipe", () => {
    it("returns 400 when name is missing", async () => {
      const { post } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });
      const res = await post("/", { ingredients: [], instructions: [] });
      expect(res.status).toBe(400);
    });

    it("creates a recipe and returns 201", async () => {
      mockDb.setInsertResult([{ ...sampleRecipe, id: "r-new" }]);
      const { post } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await post("/", {
        name: "Pasta Carbonara",
        ingredients: [{ amount: "200", unit: "g", ingredient: "spaghetti" }],
        instructions: [{ step: 1, description: "Boil pasta" }],
      });
      expect(res.status).toBe(201);
      expect((await res.json()).name).toBe("Pasta Carbonara");
    });
  });

  // ==================== PUT /:id ====================

  describe("PUT /:id - Update recipe", () => {
    it("returns 404 when recipe not found", async () => {
      mockDb.setSelectResult([]);
      const { put } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await put("/nonexistent", { name: "Updated" });
      expect(res.status).toBe(404);
    });

    it("updates recipe and returns updated data", async () => {
      const updated = { ...sampleRecipe, name: "Updated Pasta" };
      mockDb.setSelectResult([sampleRecipe]);
      mockDb.setUpdateResult([updated]);
      const { put } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await put("/r1", { name: "Updated Pasta" });
      expect(res.status).toBe(200);
      expect((await res.json()).name).toBe("Updated Pasta");
    });
  });

  // ==================== DELETE /:id ====================

  describe("DELETE /:id - Delete recipe", () => {
    it("returns 404 when recipe not found", async () => {
      mockDb.setDeleteResult([]);
      const { delete: del } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/nonexistent");
      expect(res.status).toBe(404);
    });

    it("deletes recipe and returns success", async () => {
      mockDb.setDeleteResult([{ id: "r1" }]);
      const { delete: del } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await del("/r1");
      expect(res.status).toBe(200);
      expect((await res.json()).success).toBe(true);
    });
  });

  // ==================== POST /:id/copy ====================

  describe("POST /:id/copy - Copy recipe", () => {
    it("returns 404 when original recipe not found", async () => {
      mockDb.setSelectResult([]);
      const { post } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await post("/nonexistent/copy", {});
      expect(res.status).toBe(404);
    });

    it("creates a copy and returns 201", async () => {
      const copy = { ...sampleRecipe, id: "r-copy", copiedFromId: "r1" };
      mockDb.setSelectResult([sampleRecipe]);
      mockDb.setInsertResult([copy]);
      const { post } = createTestClient({ routes: recipesRoutes, user: testUsers.host, db: mockDb.db });

      const res = await post("/r1/copy", {});
      expect(res.status).toBe(201);
      expect((await res.json()).copiedFromId).toBe("r1");
    });
  });
});
