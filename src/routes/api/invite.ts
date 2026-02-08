import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, or } from "drizzle-orm";
import { parties, guests, contributionItems } from "../../../drizzle/schema";
import { rsvpResponseSchema } from "../../lib/schemas";
import { normalizePhone } from "../../lib/phone";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

// Chain routes for type inference
const inviteRoutes = new Hono<AppContext>()
  // ==================== GUEST-SPECIFIC INVITE ROUTES ====================

  // GET /api/invite/g/:guestToken - Get party info by guest-specific token (public)
  .get("/g/:guestToken", async (c) => {
    const guestToken = c.req.param("guestToken");
    const db = c.get("db");

    // Find the guest by their unique token
    const [guest] = await db
      .select()
      .from(guests)
      .where(eq(guests.guestToken, guestToken));

    if (!guest) {
      return c.json({ error: "Invitation not found" }, 404);
    }

    // Fetch the party
    const [party] = await db
      .select({
        id: parties.id,
        name: parties.name,
        description: parties.description,
        dateTime: parties.dateTime,
        location: parties.location,
      })
      .from(parties)
      .where(eq(parties.id, guest.partyId));

    if (!party) {
      return c.json({ error: "Invitation not found" }, 404);
    }

    // Get contribution items that guests can claim
    const contributions = await db
      .select({
        id: contributionItems.id,
        description: contributionItems.description,
        claimedByGuestId: contributionItems.claimedByGuestId,
      })
      .from(contributionItems)
      .where(eq(contributionItems.partyId, party.id));

    return c.json({
      party,
      contributions,
      guest: {
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
      },
    });
  })

  // POST /api/invite/g/:guestToken - Submit RSVP via guest-specific token (public)
  .post("/g/:guestToken", async (c) => {
    const guestToken = c.req.param("guestToken");
    const db = c.get("db");
    const contentType = c.req.header("content-type") || "";

    // Find the guest by their unique token
    const [existingGuest] = await db
      .select()
      .from(guests)
      .where(eq(guests.guestToken, guestToken));

    if (!existingGuest) {
      return c.json({ error: "Invitation not found" }, 404);
    }

    // Fetch the party
    const [party] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, existingGuest.partyId));

    if (!party) {
      return c.json({ error: "Invitation not found" }, 404);
    }

    // Handle both form data and JSON
    let name: string;
    let email: string | undefined;
    let phone: string | undefined;
    let rsvpStatus: string;
    let headcount: number | undefined;
    let dietaryRestrictions: string | undefined;
    let claimContributionIds: string[] | undefined;

    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      name = body.name;
      email = body.email;
      phone = body.phone;
      rsvpStatus = body.rsvpStatus;
      headcount = body.headcount;
      dietaryRestrictions = body.dietaryRestrictions;
      claimContributionIds = body.claimContributionIds;
    } else {
      const formData = await c.req.parseBody();
      name = formData.name as string;
      email = formData.email as string | undefined;
      phone = formData.phone as string | undefined;
      rsvpStatus = formData.rsvpStatus as string;
      headcount = formData.headcount ? parseInt(formData.headcount as string, 10) : undefined;
      dietaryRestrictions = formData.dietaryRestrictions as string | undefined;
      const claims = formData.claimContributionIds;
      if (claims) {
        claimContributionIds = Array.isArray(claims) ? claims as string[] : [claims as string];
      }
    }

    // Normalize phone if provided
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    if (!name || !rsvpStatus) {
      return c.json({ error: "Name and RSVP status are required" }, 400);
    }

    // Parse dietary restrictions from string to array
    const dietaryArray = dietaryRestrictions
      ? String(dietaryRestrictions)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    // Update the existing guest record (the guest was already created when the invite was sent)
    const [guest] = await db
      .update(guests)
      .set({
        name,
        email: email || existingGuest.email,
        phone: normalizedPhone || existingGuest.phone,
        rsvpStatus,
        headcount: rsvpStatus === "yes" ? headcount || 1 : 0,
        dietaryRestrictions: dietaryArray,
      })
      .where(eq(guests.id, existingGuest.id))
      .returning();

    // Handle contribution claims
    if (claimContributionIds && claimContributionIds.length > 0) {
      for (const itemId of claimContributionIds) {
        const [item] = await db
          .select()
          .from(contributionItems)
          .where(
            and(
              eq(contributionItems.id, itemId),
              eq(contributionItems.partyId, party.id)
            )
          );

        if (item && !item.claimedByGuestId) {
          await db
            .update(contributionItems)
            .set({ claimedByGuestId: guest.id })
            .where(eq(contributionItems.id, itemId));
        }
      }
    }

    // Redirect for form submissions to a thank you page
    if (!contentType.includes("application/json")) {
      const params = new URLSearchParams();
      if (guest.email) params.set("email", guest.email);
      if (guest.phone) params.set("phone", guest.phone);
      if (guest.name) params.set("name", guest.name);
      const queryString = params.toString();
      return c.redirect(`/invite/g/${guestToken}/thanks${queryString ? `?${queryString}` : ""}`);
    }
    return c.json({ success: true, guest });
  })

  // GET /api/invite/g/:guestToken/thanks - Redirect to thank you page
  .get("/g/:guestToken/thanks", async (c) => {
    const guestToken = c.req.param("guestToken");
    const url = new URL(c.req.url);
    const queryString = url.search;
    return c.redirect(`/invite/g/${guestToken}/thanks${queryString}`);
  })

  // ==================== GENERIC SHARE LINK ROUTES ====================

  // GET /api/invite/:token - Get party info by share token (public)
  .get("/:token", async (c) => {
    const token = c.req.param("token");
    const db = c.get("db");

    const [party] = await db
      .select({
        id: parties.id,
        name: parties.name,
        description: parties.description,
        dateTime: parties.dateTime,
        location: parties.location,
      })
      .from(parties)
      .where(eq(parties.shareToken, token));

    if (!party) {
      return c.json({ error: "Invitation not found" }, 404);
    }

    // Get contribution items that guests can claim
    const contributions = await db
      .select({
        id: contributionItems.id,
        description: contributionItems.description,
        claimedByGuestId: contributionItems.claimedByGuestId,
      })
      .from(contributionItems)
      .where(eq(contributionItems.partyId, party.id));

    return c.json({ party, contributions });
  })

  // POST /api/invite/:token - Submit RSVP (public)
  .post("/:token", async (c) => {
    const token = c.req.param("token");
    const db = c.get("db");
    const contentType = c.req.header("content-type") || "";

    const [party] = await db
      .select()
      .from(parties)
      .where(eq(parties.shareToken, token));

    if (!party) {
      return c.json({ error: "Invitation not found" }, 404);
    }

    // Handle both form data and JSON
    let name: string;
    let email: string | undefined;
    let phone: string | undefined;
    let rsvpStatus: string;
    let headcount: number | undefined;
    let dietaryRestrictions: string | undefined;
    let claimContributionIds: string[] | undefined;

    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      name = body.name;
      email = body.email;
      phone = body.phone;
      rsvpStatus = body.rsvpStatus;
      headcount = body.headcount;
      dietaryRestrictions = body.dietaryRestrictions;
      claimContributionIds = body.claimContributionIds;
    } else {
      const formData = await c.req.parseBody();
      name = formData.name as string;
      email = formData.email as string | undefined;
      phone = formData.phone as string | undefined;
      rsvpStatus = formData.rsvpStatus as string;
      headcount = formData.headcount ? parseInt(formData.headcount as string, 10) : undefined;
      dietaryRestrictions = formData.dietaryRestrictions as string | undefined;
      // Handle checkbox array for contribution claims
      const claims = formData.claimContributionIds;
      if (claims) {
        claimContributionIds = Array.isArray(claims) ? claims as string[] : [claims as string];
      }
    }

    // Normalize phone if provided
    const normalizedPhone = phone ? normalizePhone(phone) : null;

    if (!name || !rsvpStatus) {
      return c.json({ error: "Name and RSVP status are required" }, 400);
    }

    if (!email && !normalizedPhone) {
      return c.json({ error: "Either email or phone is required" }, 400);
    }

    // Check if guest already exists (by email or phone)
    let existing = null;

    if (email) {
      const [byEmail] = await db
        .select()
        .from(guests)
        .where(and(eq(guests.partyId, party.id), eq(guests.email, email)));
      if (byEmail) existing = byEmail;
    }

    if (!existing && normalizedPhone) {
      const [byPhone] = await db
        .select()
        .from(guests)
        .where(and(eq(guests.partyId, party.id), eq(guests.phone, normalizedPhone)));
      if (byPhone) existing = byPhone;
    }

    let guest;

    // Parse dietary restrictions from string to array
    const dietaryArray = dietaryRestrictions
      ? String(dietaryRestrictions)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;

    if (existing) {
      // Update existing guest
      [guest] = await db
        .update(guests)
        .set({
          name,
          email: email || existing.email, // Keep existing email if not provided
          phone: normalizedPhone || existing.phone, // Keep existing phone if not provided
          rsvpStatus,
          headcount: rsvpStatus === "yes" ? headcount || 1 : 0,
          dietaryRestrictions: dietaryArray,
        })
        .where(eq(guests.id, existing.id))
        .returning();
    } else {
      // Create new guest
      [guest] = await db
        .insert(guests)
        .values({
          partyId: party.id,
          email: email || null,
          phone: normalizedPhone,
          name,
          rsvpStatus,
          headcount: rsvpStatus === "yes" ? headcount || 1 : 0,
          dietaryRestrictions: dietaryArray,
          guestToken: crypto.randomUUID().slice(0, 12),
        })
        .returning();
    }

    // Handle contribution claims
    if (claimContributionIds && claimContributionIds.length > 0) {
      for (const itemId of claimContributionIds) {
        // Only claim if not already claimed
        const [item] = await db
          .select()
          .from(contributionItems)
          .where(
            and(
              eq(contributionItems.id, itemId),
              eq(contributionItems.partyId, party.id)
            )
          );

        if (item && !item.claimedByGuestId) {
          await db
            .update(contributionItems)
            .set({ claimedByGuestId: guest.id })
            .where(eq(contributionItems.id, itemId));
        }
      }
    }

    // Redirect for form submissions to a thank you page
    // Include contact info so they can easily create an account
    if (!contentType.includes("application/json")) {
      const params = new URLSearchParams();
      if (guest.email) params.set("email", guest.email);
      if (guest.phone) params.set("phone", guest.phone);
      if (guest.name) params.set("name", guest.name);
      const queryString = params.toString();
      return c.redirect(`/invite/${token}/thanks${queryString ? `?${queryString}` : ""}`);
    }
    return c.json({ success: true, guest });
  })

  // GET /api/invite/:token/thanks - Thank you page after RSVP
  // Now redirects to the page route for a richer experience
  .get("/:token/thanks", async (c) => {
    const token = c.req.param("token");
    const url = new URL(c.req.url);
    const queryString = url.search;
    return c.redirect(`/invite/${token}/thanks${queryString}`);
  });

// Export type for client
export type InviteRoutes = typeof inviteRoutes;
export { inviteRoutes };
