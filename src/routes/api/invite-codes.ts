import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import {
  inviteCodes,
  inviteCodeUses,
  pendingInvites,
  users,
} from "../../../drizzle/schema";
import { requireAuth, getUser } from "../../lib/hono-auth";
import { isAdmin, generateInviteCode } from "../../lib/admin";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

// Validation schemas
const validateCodeSchema = z.object({
  code: z.string().min(1),
  email: z.string().email(),
});

const createCodeSchema = z.object({
  maxUses: z.number().int().positive().optional().default(1),
  note: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const inviteCodesRoutes = new Hono<AppContext>()
  // POST /api/invite-codes/validate - Validate an invite code (public)
  .post("/validate", zValidator("json", validateCodeSchema), async (c) => {
    const db = c.get("db");
    const { code, email } = c.req.valid("json");

    // Normalize code (uppercase, trim)
    const normalizedCode = code.toUpperCase().trim();

    // Find the invite code
    const [inviteCode] = await db
      .select()
      .from(inviteCodes)
      .where(eq(inviteCodes.code, normalizedCode));

    if (!inviteCode) {
      return c.json({ valid: false, error: "Invalid invite code" }, 400);
    }

    // Check if code is expired
    if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
      return c.json({ valid: false, error: "Invite code has expired" }, 400);
    }

    // Check if code is used up
    if (
      inviteCode.maxUses !== null &&
      inviteCode.usedCount !== null &&
      inviteCode.usedCount >= inviteCode.maxUses
    ) {
      return c.json(
        { valid: false, error: "Invite code has reached its usage limit" },
        400
      );
    }

    // Store in pending_invites for the OAuth callback to find
    await db
      .insert(pendingInvites)
      .values({
        email: email.toLowerCase(),
        code: normalizedCode,
        inviteCodeId: inviteCode.id,
      })
      .onConflictDoUpdate({
        target: pendingInvites.email,
        set: {
          code: normalizedCode,
          inviteCodeId: inviteCode.id,
          createdAt: new Date(),
        },
      });

    return c.json({ valid: true });
  })

  // GET /api/invite-codes - List all invite codes (admin only)
  .get("/", requireAuth, async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (!isAdmin(user.email, c.env.ADMIN_EMAILS)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const db = c.get("db");

    // Get all invite codes with creator info
    const codes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        maxUses: inviteCodes.maxUses,
        usedCount: inviteCodes.usedCount,
        note: inviteCodes.note,
        expiresAt: inviteCodes.expiresAt,
        createdAt: inviteCodes.createdAt,
        createdByEmail: users.email,
      })
      .from(inviteCodes)
      .leftJoin(users, eq(inviteCodes.createdBy, users.id))
      .orderBy(inviteCodes.createdAt);

    return c.json(codes);
  })

  // POST /api/invite-codes - Create new invite code (admin only)
  .post("/", requireAuth, zValidator("json", createCodeSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (!isAdmin(user.email, c.env.ADMIN_EMAILS)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const db = c.get("db");
    const data = c.req.valid("json");

    const code = generateInviteCode();

    const [newCode] = await db
      .insert(inviteCodes)
      .values({
        code,
        maxUses: data.maxUses,
        note: data.note || null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdBy: user.id,
      })
      .returning();

    return c.json(newCode, 201);
  })

  // DELETE /api/invite-codes/:id - Delete an invite code (admin only)
  .delete("/:id", requireAuth, async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (!isAdmin(user.email, c.env.ADMIN_EMAILS)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const id = c.req.param("id");
    const db = c.get("db");

    // Delete associated uses first
    await db.delete(inviteCodeUses).where(eq(inviteCodeUses.inviteCodeId, id));

    // Delete the code
    const [deleted] = await db
      .delete(inviteCodes)
      .where(eq(inviteCodes.id, id))
      .returning();

    if (!deleted) {
      return c.json({ error: "Invite code not found" }, 404);
    }

    return c.json({ success: true });
  })

  // GET /api/invite-codes/:id/uses - Get usage history (admin only)
  .get("/:id/uses", requireAuth, async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    if (!isAdmin(user.email, c.env.ADMIN_EMAILS)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const id = c.req.param("id");
    const db = c.get("db");

    const uses = await db
      .select({
        id: inviteCodeUses.id,
        usedAt: inviteCodeUses.usedAt,
        userEmail: users.email,
        userName: users.name,
      })
      .from(inviteCodeUses)
      .innerJoin(users, eq(inviteCodeUses.userId, users.id))
      .where(eq(inviteCodeUses.inviteCodeId, id))
      .orderBy(inviteCodeUses.usedAt);

    return c.json(uses);
  });

// Cleanup function for stale pending invites (> 24 hours old)
export async function cleanupPendingInvites(
  db: ReturnType<typeof createDb>
): Promise<number> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const deleted = await db
    .delete(pendingInvites)
    .where(lt(pendingInvites.createdAt, twentyFourHoursAgo))
    .returning();

  return deleted.length;
}

export type InviteCodesRoutes = typeof inviteCodesRoutes;
export { inviteCodesRoutes };
