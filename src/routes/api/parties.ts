import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, desc, asc } from "drizzle-orm";
import type { generateObject as GenerateObjectType } from "ai";
import { z } from "zod";
import {
  parties,
  guests,
  partyMenu,
  recipes,
  timelineTasks,
  contributionItems,
  users,
  calendarConnections,
  scheduledReminders,
  smsOptOuts,
} from "../../../drizzle/schema";
import { requireAuth, getUser } from "../../lib/hono-auth";
import {
  createPartySchema,
  updatePartySchema,
  createGuestSchema,
  updateGuestSchema,
  addToMenuSchema,
  updateTimelineTaskSchema,
  inviteGuestsSchema,
} from "../../lib/schemas";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";
import { createAI } from "../../lib/ai";
import { normalizePhone } from "../../lib/phone";
import { getTwilioConfig, sendInviteSms } from "../../lib/sms";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

// Helper to verify party ownership
async function verifyPartyOwnership(
  db: ReturnType<typeof createDb>,
  partyId: string,
  userId: string
) {
  const [party] = await db
    .select()
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.hostId, userId)));
  return party;
}

// Chain routes for type inference
const partiesRoutes = new Hono<AppContext>()
  .use("*", requireAuth)

  // ==================== PARTIES CRUD ====================

  // GET /api/parties - List all parties
  .get("/", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const userParties = await db
      .select()
      .from(parties)
      .where(eq(parties.hostId, user.id))
      .orderBy(desc(parties.dateTime));

    return c.json(userParties);
  })

  // GET /api/parties/:id - Get a specific party
  .get("/:id", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, id, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    return c.json(party);
  })

  // POST /api/parties - Create a new party
  .post("/", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const db = c.get("db");
    const contentType = c.req.header("content-type") || "";

    let name: string;
    let description: string | undefined;
    let dateTime: Date;
    let location: string | undefined;

    if (contentType.includes("application/json")) {
      const json = await c.req.json();
      name = json.name;
      description = json.description;
      dateTime = new Date(json.dateTime);
      location = json.location;
    } else {
      const formData = await c.req.parseBody();
      name = formData.name as string;
      description = formData.description as string | undefined;
      dateTime = new Date(formData.dateTime as string);
      location = formData.location as string | undefined;
    }

    if (!name) {
      return c.json({ error: "Party name is required" }, 400);
    }

    const shareToken = crypto.randomUUID().slice(0, 8);

    const [newParty] = await db
      .insert(parties)
      .values({
        hostId: user.id,
        name,
        description: description || null,
        dateTime,
        location: location || null,
        shareToken,
      })
      .returning();

    // Redirect for form submissions, JSON for API calls
    if (!contentType.includes("application/json")) {
      return c.redirect(`/parties/${newParty.id}`);
    }
    return c.json(newParty, 201);
  })

  // PUT /api/parties/:id - Update a party
  .put("/:id", zValidator("json", updatePartySchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");
    const db = c.get("db");

    const existing = await verifyPartyOwnership(db, id, user.id);
    if (!existing) {
      return c.json({ error: "Party not found" }, 404);
    }

    const data = c.req.valid("json");

    const [updated] = await db
      .update(parties)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.dateTime !== undefined && { dateTime: data.dateTime }),
        ...(data.location !== undefined && { location: data.location }),
      })
      .where(eq(parties.id, id))
      .returning();

    return c.json(updated);
  })

  // DELETE /api/parties/:id - Delete a party
  .delete("/:id", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");
    const db = c.get("db");

    const [deleted] = await db
      .delete(parties)
      .where(and(eq(parties.id, id), eq(parties.hostId, user.id)))
      .returning();

    if (!deleted) {
      return c.json({ error: "Party not found" }, 404);
    }

    return c.json({ success: true });
  })

  // ==================== GUESTS ====================

  // GET /api/parties/:id/guests - List all guests
  .get("/:id/guests", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const guestList = await db
      .select()
      .from(guests)
      .where(eq(guests.partyId, partyId));

    return c.json({ partyId, guests: guestList });
  })

  // POST /api/parties/:id/guests - Add a guest
  .post("/:id/guests", zValidator("json", createGuestSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const data = c.req.valid("json");

    // Normalize phone if provided
    const phone = data.phone ? normalizePhone(data.phone) : null;
    if (data.phone && !phone) {
      return c.json({ error: "Invalid phone number format" }, 400);
    }

    // Check if guest already exists (by email or phone)
    if (data.email) {
      const [existingByEmail] = await db
        .select()
        .from(guests)
        .where(and(eq(guests.partyId, partyId), eq(guests.email, data.email)));

      if (existingByEmail) {
        return c.json({ error: "Guest with this email already invited" }, 409);
      }
    }

    if (phone) {
      const [existingByPhone] = await db
        .select()
        .from(guests)
        .where(and(eq(guests.partyId, partyId), eq(guests.phone, phone)));

      if (existingByPhone) {
        return c.json({ error: "Guest with this phone already invited" }, 409);
      }
    }

    const [guest] = await db
      .insert(guests)
      .values({
        partyId,
        email: data.email || null,
        phone: phone,
        name: data.name || null,
        rsvpStatus: data.rsvpStatus || "pending",
        headcount: data.headcount || 1,
        dietaryRestrictions: data.dietaryRestrictions || null,
      })
      .returning();

    return c.json(guest, 201);
  })

  // PUT /api/parties/:id/guests/:guestId - Update a guest
  .put("/:id/guests/:guestId", zValidator("json", updateGuestSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const guestId = c.req.param("guestId");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const data = c.req.valid("json");

    const [updated] = await db
      .update(guests)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.rsvpStatus !== undefined && { rsvpStatus: data.rsvpStatus }),
        ...(data.headcount !== undefined && { headcount: data.headcount }),
        ...(data.dietaryRestrictions !== undefined && { dietaryRestrictions: data.dietaryRestrictions }),
      })
      .where(and(eq(guests.id, guestId), eq(guests.partyId, partyId)))
      .returning();

    if (!updated) {
      return c.json({ error: "Guest not found" }, 404);
    }

    return c.json(updated);
  })

  // DELETE /api/parties/:id/guests/:guestId - Remove a guest
  .delete("/:id/guests/:guestId", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const guestId = c.req.param("guestId");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const [deleted] = await db
      .delete(guests)
      .where(and(eq(guests.id, guestId), eq(guests.partyId, partyId)))
      .returning();

    if (!deleted) {
      return c.json({ error: "Guest not found" }, 404);
    }

    return c.json({ success: true });
  })

  // POST /api/parties/:id/invite - Send invites to guests
  .post("/:id/invite", zValidator("json", inviteGuestsSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");
    const { emails, phones } = c.req.valid("json");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    // Get user info for the host name
    const [hostUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    const inviteUrl = `${c.env.APP_URL || "https://chefde.party"}/invite/${party.shareToken}`;
    const results: Array<{
      type: "email" | "phone";
      contact: string;
      status: "sent" | "failed";
      guestId?: string;
      error?: string;
    }> = [];

    // Send email invites
    if (emails && emails.length > 0) {
      for (const email of emails) {
        try {
          // Check if guest already exists
          let [guest] = await db
            .select()
            .from(guests)
            .where(and(eq(guests.partyId, partyId), eq(guests.email, email)));

          if (!guest) {
            // Create new guest
            [guest] = await db
              .insert(guests)
              .values({
                partyId,
                email,
                name: email.split("@")[0],
                rsvpStatus: "pending",
              })
              .returning();
          }

          // Send invite email via Resend
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "ChefDeParty <noreply@chefde.party>",
              to: email,
              subject: `You're invited to ${party.name}!`,
              html: `
                <h1>You're Invited!</h1>
                <p>${hostUser?.name || "Your host"} has invited you to ${party.name}.</p>
                <p><strong>When:</strong> ${party.dateTime.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}</p>
                ${party.location ? `<p><strong>Where:</strong> ${party.location}</p>` : ""}
                ${party.description ? `<p>${party.description}</p>` : ""}
                <p><a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; text-decoration: none; border-radius: 6px;">RSVP Now</a></p>
              `,
            }),
          });

          if (emailRes.ok) {
            results.push({ type: "email", contact: email, status: "sent", guestId: guest.id });
          } else {
            results.push({ type: "email", contact: email, status: "failed" });
          }
        } catch (error) {
          console.error(`Failed to send invite to ${email}:`, error);
          results.push({ type: "email", contact: email, status: "failed" });
        }
      }
    }

    // Send SMS invites
    if (phones && phones.length > 0) {
      const twilioConfig = getTwilioConfig(c.env);

      for (const rawPhone of phones) {
        const phone = normalizePhone(rawPhone);

        if (!phone) {
          results.push({
            type: "phone",
            contact: rawPhone,
            status: "failed",
            error: "Invalid phone number format",
          });
          continue;
        }

        if (!twilioConfig) {
          results.push({
            type: "phone",
            contact: phone,
            status: "failed",
            error: "SMS service not configured",
          });
          continue;
        }

        // Check if phone number has opted out
        const [optOut] = await db
          .select()
          .from(smsOptOuts)
          .where(eq(smsOptOuts.phone, phone));

        if (optOut) {
          results.push({
            type: "phone",
            contact: phone,
            status: "failed",
            error: "This number has opted out of SMS messages",
          });
          continue;
        }

        try {
          // Check if guest already exists
          let [guest] = await db
            .select()
            .from(guests)
            .where(and(eq(guests.partyId, partyId), eq(guests.phone, phone)));

          if (!guest) {
            // Create new guest
            [guest] = await db
              .insert(guests)
              .values({
                partyId,
                phone,
                rsvpStatus: "pending",
              })
              .returning();
          }

          // Send SMS invite via Twilio
          const smsResult = await sendInviteSms(
            twilioConfig,
            phone,
            party.name,
            hostUser?.name || null,
            inviteUrl
          );

          if (smsResult.success) {
            results.push({ type: "phone", contact: phone, status: "sent", guestId: guest.id });
          } else {
            // If Twilio reports opt-out, record it in our database
            if (smsResult.optedOut) {
              await db
                .insert(smsOptOuts)
                .values({ phone })
                .onConflictDoNothing();
            }
            results.push({
              type: "phone",
              contact: phone,
              status: "failed",
              error: smsResult.error,
            });
          }
        } catch (error) {
          console.error(`Failed to send SMS invite to ${phone}:`, error);
          results.push({ type: "phone", contact: phone, status: "failed" });
        }
      }
    }

    return c.json({ results });
  })

  // ==================== MENU ====================

  // GET /api/parties/:id/menu - List menu items
  .get("/:id/menu", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const menuItems = await db
      .select({
        id: partyMenu.id,
        partyId: partyMenu.partyId,
        recipeId: partyMenu.recipeId,
        scaledServings: partyMenu.scaledServings,
        course: partyMenu.course,
        createdAt: partyMenu.createdAt,
        recipe: {
          id: recipes.id,
          name: recipes.name,
          description: recipes.description,
          prepTimeMinutes: recipes.prepTimeMinutes,
          cookTimeMinutes: recipes.cookTimeMinutes,
          servings: recipes.servings,
          ingredients: recipes.ingredients,
          instructions: recipes.instructions,
          dietaryTags: recipes.dietaryTags,
          copiedFromId: recipes.copiedFromId,
        },
      })
      .from(partyMenu)
      .innerJoin(recipes, eq(partyMenu.recipeId, recipes.id))
      .where(eq(partyMenu.partyId, partyId));

    return c.json(menuItems);
  })

  // POST /api/parties/:id/menu - Add recipe to menu (copy-on-add)
  .post("/:id/menu", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    // Handle both form data and JSON
    const contentType = c.req.header("content-type") || "";
    let recipeId: string;
    let scaledServings: number | undefined;
    let course: string | undefined;

    if (contentType.includes("application/json")) {
      const json = await c.req.json();
      recipeId = json.recipeId;
      scaledServings = json.scaledServings;
      course = json.course;
    } else {
      const formData = await c.req.parseBody();
      recipeId = formData.recipeId as string;
      scaledServings = formData.servings ? parseInt(formData.servings as string, 10) : undefined;
      course = formData.course as string | undefined;
    }

    if (!recipeId) {
      return c.json({ error: "Recipe ID is required" }, 400);
    }

    // Get the original recipe
    const [originalRecipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, recipeId), eq(recipes.ownerId, user.id)));

    if (!originalRecipe) {
      return c.json({ error: "Recipe not found" }, 404);
    }

    // Copy-on-add: Create a copy of the recipe
    const shareToken = crypto.randomUUID().slice(0, 8);

    const [recipeCopy] = await db
      .insert(recipes)
      .values({
        ownerId: user.id,
        name: originalRecipe.name,
        description: originalRecipe.description,
        sourceUrl: originalRecipe.sourceUrl,
        sourceType: originalRecipe.sourceType,
        copiedFromId: originalRecipe.id,
        shareToken,
        ingredients: originalRecipe.ingredients,
        instructions: originalRecipe.instructions,
        prepTimeMinutes: originalRecipe.prepTimeMinutes,
        cookTimeMinutes: originalRecipe.cookTimeMinutes,
        servings: originalRecipe.servings,
        tags: originalRecipe.tags,
        dietaryTags: originalRecipe.dietaryTags,
      })
      .returning();

    // Create menu item
    const [menuItem] = await db
      .insert(partyMenu)
      .values({
        partyId,
        recipeId: recipeCopy.id,
        course: course || null,
        scaledServings: scaledServings || originalRecipe.servings,
      })
      .returning();

    // Redirect for form submissions, JSON response for API calls
    if (!contentType.includes("application/json")) {
      return c.redirect(`/parties/${partyId}/menu`);
    }
    return c.json({ menuItem, recipe: recipeCopy }, 201);
  })

  // POST handler for menu item delete (HTML forms can't use DELETE)
  .post("/:id/menu/:menuItemId", async (c) => {
    const formData = await c.req.parseBody();
    if (formData._method === "DELETE") {
      const user = getUser(c);
      if (!user) return c.redirect("/login");

      const partyId = c.req.param("id");
      const menuItemId = c.req.param("menuItemId");
      const db = c.get("db");

      const party = await verifyPartyOwnership(db, partyId, user.id);
      if (!party) {
        return c.redirect(`/parties/${partyId}/menu`);
      }

      const [menuItem] = await db
        .select()
        .from(partyMenu)
        .where(and(eq(partyMenu.id, menuItemId), eq(partyMenu.partyId, partyId)));

      if (menuItem) {
        // Delete menu item first
        await db.delete(partyMenu).where(eq(partyMenu.id, menuItemId));
        // Delete timeline tasks that reference this recipe
        await db.delete(timelineTasks).where(eq(timelineTasks.recipeId, menuItem.recipeId));
        // Now safe to delete the recipe copy
        await db.delete(recipes).where(eq(recipes.id, menuItem.recipeId));
      }

      return c.redirect(`/parties/${partyId}/menu`);
    }
    return c.json({ error: "Method not allowed" }, 405);
  })

  // DELETE /api/parties/:id/menu/:menuItemId - Remove from menu
  .delete("/:id/menu/:menuItemId", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const menuItemId = c.req.param("menuItemId");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    // Get menu item to find recipe
    const [menuItem] = await db
      .select()
      .from(partyMenu)
      .where(and(eq(partyMenu.id, menuItemId), eq(partyMenu.partyId, partyId)));

    if (!menuItem) {
      return c.json({ error: "Menu item not found" }, 404);
    }

    // Delete the menu item
    await db.delete(partyMenu).where(eq(partyMenu.id, menuItemId));

    // Delete timeline tasks that reference this recipe
    await db.delete(timelineTasks).where(eq(timelineTasks.recipeId, menuItem.recipeId));

    // Delete the copied recipe
    await db.delete(recipes).where(eq(recipes.id, menuItem.recipeId));

    return c.json({ success: true });
  })

  // ==================== TIMELINE ====================

  // GET /api/parties/:id/timeline - List timeline tasks
  .get("/:id/timeline", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const tasks = await db
      .select({
        id: timelineTasks.id,
        recipeId: timelineTasks.recipeId,
        description: timelineTasks.description,
        scheduledDate: timelineTasks.scheduledDate,
        scheduledTime: timelineTasks.scheduledTime,
        durationMinutes: timelineTasks.durationMinutes,
        completed: timelineTasks.completed,
        sortOrder: timelineTasks.sortOrder,
        isPhaseStart: timelineTasks.isPhaseStart,
        phaseDescription: timelineTasks.phaseDescription,
        createdAt: timelineTasks.createdAt,
        recipeName: recipes.name,
      })
      .from(timelineTasks)
      .leftJoin(recipes, eq(timelineTasks.recipeId, recipes.id))
      .where(eq(timelineTasks.partyId, partyId))
      .orderBy(asc(timelineTasks.scheduledDate), asc(timelineTasks.sortOrder));

    return c.json({
      partyId,
      partyName: party.name,
      partyDateTime: party.dateTime,
      tasks,
    });
  })

  // POST /api/parties/:id/timeline - Create a task
  .post("/:id/timeline", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const body = await c.req.json();
    const { recipeId, description, scheduledDate, scheduledTime, durationMinutes, sortOrder } = body;

    if (!description || !scheduledDate) {
      return c.json({ error: "Description and scheduled date are required" }, 400);
    }

    const [task] = await db
      .insert(timelineTasks)
      .values({
        partyId,
        recipeId: recipeId || null,
        description,
        scheduledDate: new Date(scheduledDate),
        scheduledTime: scheduledTime || null,
        durationMinutes: durationMinutes || null,
        sortOrder: sortOrder || 0,
      })
      .returning();

    return c.json(task, 201);
  })

  // PATCH /api/parties/:id/timeline/:taskId - Update a task
  .patch("/:id/timeline/:taskId", zValidator("json", updateTimelineTaskSchema), async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const taskId = c.req.param("taskId");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const data = c.req.valid("json");

    const [updated] = await db
      .update(timelineTasks)
      .set({
        completed: data.completed,
      })
      .where(and(eq(timelineTasks.id, taskId), eq(timelineTasks.partyId, partyId)))
      .returning();

    if (!updated) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json(updated);
  })

  // DELETE /api/parties/:id/timeline - Delete all tasks
  .delete("/:id/timeline", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    await db.delete(timelineTasks).where(eq(timelineTasks.partyId, partyId));

    return c.json({ success: true });
  })

  // DELETE /api/parties/:id/timeline/:taskId - Delete a specific task
  .delete("/:id/timeline/:taskId", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const taskId = c.req.param("taskId");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const [deleted] = await db
      .delete(timelineTasks)
      .where(and(eq(timelineTasks.id, taskId), eq(timelineTasks.partyId, partyId)))
      .returning();

    if (!deleted) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json({ success: true });
  })

  // ==================== CONTRIBUTIONS ====================

  // GET /api/parties/:id/contributions - List contribution items
  .get("/:id/contributions", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const items = await db
      .select({
        id: contributionItems.id,
        description: contributionItems.description,
        claimedByGuestId: contributionItems.claimedByGuestId,
        createdAt: contributionItems.createdAt,
        claimedBy: {
          id: guests.id,
          name: guests.name,
          email: guests.email,
        },
      })
      .from(contributionItems)
      .leftJoin(guests, eq(contributionItems.claimedByGuestId, guests.id))
      .where(eq(contributionItems.partyId, partyId));

    return c.json(items);
  })

  // POST /api/parties/:id/contributions - Add a contribution item
  .post("/:id/contributions", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    // Handle both JSON and form data
    const contentType = c.req.header("content-type") || "";
    let description: string | undefined;

    if (contentType.includes("application/json")) {
      const body = await c.req.json();
      description = body.description;
    } else {
      const formData = await c.req.parseBody();
      description = (formData.name as string) || (formData.description as string);
    }

    if (!description) {
      return c.json({ error: "Description is required" }, 400);
    }

    const [item] = await db
      .insert(contributionItems)
      .values({
        partyId,
        description,
      })
      .returning();

    // Redirect for form submissions, JSON for API calls
    if (contentType.includes("application/json")) {
      return c.json(item, 201);
    }
    return c.redirect(`/parties/${partyId}/contributions`);
  })

  // DELETE /api/parties/:id/contributions/:itemId - Remove a contribution item
  .delete("/:id/contributions/:itemId", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const itemId = c.req.param("itemId");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    const [deleted] = await db
      .delete(contributionItems)
      .where(and(eq(contributionItems.id, itemId), eq(contributionItems.partyId, partyId)))
      .returning();

    if (!deleted) {
      return c.json({ error: "Item not found" }, 404);
    }

    return c.json({ success: true });
  })

  // POST handler for contribution delete (HTML forms can't use DELETE)
  .post("/:id/contributions/:itemId", async (c) => {
    const formData = await c.req.parseBody();
    if (formData._method === "DELETE") {
      const user = getUser(c);
      if (!user) return c.redirect("/login");

      const partyId = c.req.param("id");
      const itemId = c.req.param("itemId");
      const db = c.get("db");

      const party = await verifyPartyOwnership(db, partyId, user.id);
      if (party) {
        await db
          .delete(contributionItems)
          .where(and(eq(contributionItems.id, itemId), eq(contributionItems.partyId, partyId)));
      }

      return c.redirect(`/parties/${partyId}/contributions`);
    }
    return c.json({ error: "Method not allowed" }, 405);
  })

  // ==================== AI TIMELINE GENERATION ====================

  // POST /api/parties/:id/timeline/generate - Generate timeline with AI
  .post("/:id/timeline/generate", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    // Get all menu items with full recipe details
    const menuItems = await db
      .select({
        menuId: partyMenu.id,
        scaledServings: partyMenu.scaledServings,
        course: partyMenu.course,
        recipe: {
          id: recipes.id,
          name: recipes.name,
          description: recipes.description,
          ingredients: recipes.ingredients,
          instructions: recipes.instructions,
          prepTimeMinutes: recipes.prepTimeMinutes,
          cookTimeMinutes: recipes.cookTimeMinutes,
          servings: recipes.servings,
        },
      })
      .from(partyMenu)
      .innerJoin(recipes, eq(partyMenu.recipeId, recipes.id))
      .where(eq(partyMenu.partyId, partyId));

    if (menuItems.length === 0) {
      const contentType = c.req.header("content-type") || "";
      if (contentType.includes("application/json")) {
        return c.json(
          { error: "No recipes in menu. Add recipes before generating a timeline." },
          400
        );
      }
      return c.redirect(`/parties/${partyId}/timeline?error=no-recipes`);
    }

    const TimelineTaskSchema = z.object({
      recipeId: z
        .string()
        .nullable()
        .describe("ID of the recipe this task belongs to, or null for general tasks"),
      description: z.string().describe("Clear, actionable task description"),
      daysBeforeParty: z
        .number()
        .describe("How many days before the party this task should be done (0 = day of party)"),
      scheduledTime: z
        .string()
        .describe("Specific time in 24h format like '09:00' or '14:30'"),
      durationMinutes: z.number().describe("Estimated active duration in minutes"),
      sortOrder: z.number().describe("Order within the same day (lower = earlier)"),
      isPhaseStart: z
        .boolean()
        .describe("True if this task marks the START of a new cooking phase"),
      phaseDescription: z
        .string()
        .nullable()
        .describe("For phase-start tasks only: A short description for the reminder"),
    });

    const TimelineSchema = z.object({
      tasks: z.array(TimelineTaskSchema),
    });

    // Format recipes for the prompt
    const recipeSummaries = menuItems.map((item) => ({
      id: item.recipe.id,
      name: item.recipe.name,
      course: item.course || "uncategorized",
      scaledServings: item.scaledServings || item.recipe.servings,
      prepTime: item.recipe.prepTimeMinutes,
      cookTime: item.recipe.cookTimeMinutes,
      ingredients: item.recipe.ingredients,
      instructions: item.recipe.instructions,
    }));

    const partyDate = party.dateTime;
    const partyTime = partyDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const prompt = `You are a professional chef and party planner. Create a precise cooking timeline for a dinner party.

PARTY DETAILS:
- Serving time: ${partyDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} at ${partyTime}
- Number of recipes: ${menuItems.length}

RECIPES TO PREPARE:
${JSON.stringify(recipeSummaries, null, 2)}

CRITICAL INSTRUCTIONS:
1. Calculate EXACT times for each task by working BACKWARDS from the serving time.
2. Consider passive prep times (thawing, marinating, rising, etc.)
3. Schedule oven tasks to avoid temperature/space conflicts
4. Build in 30-60 min buffer before guests arrive for final prep
5. Mark phase-start tasks (isPhaseStart: true) for major cooking milestones only
6. Provide phaseDescription for phase-start tasks (friendly reminder messages)`;

    try {
      const { generateObject } = await import("ai");
      const { defaultModel } = createAI(c.env.GOOGLE_GENERATIVE_AI_API_KEY);

      const result = await generateObject({
        model: defaultModel,
        schema: TimelineSchema,
        prompt,
      });

      // Delete existing tasks before inserting new ones
      await db.delete(timelineTasks).where(eq(timelineTasks.partyId, partyId));

      // Convert relative days to actual dates and insert
      const insertedTasks = [];
      for (const task of result.object.tasks) {
        const hoursBeforeParty = task.daysBeforeParty * 24;
        const taskDate = new Date(partyDate.getTime() - hoursBeforeParty * 60 * 60 * 1000);
        taskDate.setHours(0, 0, 0, 0);

        const [inserted] = await db
          .insert(timelineTasks)
          .values({
            partyId,
            recipeId: task.recipeId,
            description: task.description,
            scheduledDate: taskDate,
            scheduledTime: task.scheduledTime,
            durationMinutes: task.durationMinutes,
            sortOrder: task.sortOrder,
            isPhaseStart: task.isPhaseStart,
            phaseDescription: task.phaseDescription,
          })
          .returning();

        insertedTasks.push(inserted);
      }

      // Schedule reminders for users without calendar sync
      let remindersScheduled = 0;
      const REMINDER_MINUTES_BEFORE = 60;

      try {
        const [calendarConn] = await db
          .select()
          .from(calendarConnections)
          .where(eq(calendarConnections.userId, user.id));

        const hasCalendarSync = !!calendarConn;

        // Delete existing reminders
        await db
          .delete(scheduledReminders)
          .where(eq(scheduledReminders.partyId, partyId));

        if (!hasCalendarSync && insertedTasks.length > 0) {
          const now = new Date();
          const phaseStartTasks = insertedTasks.filter(task => task.isPhaseStart);

          for (const task of phaseStartTasks) {
            const taskStartTime = new Date(task.scheduledDate);
            if (task.scheduledTime) {
              const [hours, minutes] = task.scheduledTime.split(":").map(Number);
              taskStartTime.setHours(hours, minutes, 0, 0);
            } else {
              taskStartTime.setHours(9, 0, 0, 0);
            }

            const reminderTime = new Date(taskStartTime.getTime() - REMINDER_MINUTES_BEFORE * 60 * 1000);

            if (reminderTime > now) {
              await db.insert(scheduledReminders).values({
                partyId,
                userId: user.id,
                taskId: task.id,
                scheduledFor: reminderTime,
                taskStartTime,
              });
              remindersScheduled++;
            }
          }
        }
      } catch (err) {
        console.error("Error scheduling reminders:", err);
      }

      // Redirect for form submissions, JSON for API calls
      const contentType = c.req.header("content-type") || "";
      if (!contentType.includes("application/json")) {
        return c.redirect(`/parties/${partyId}/timeline`);
      }
      return c.json({
        success: true,
        tasksCreated: insertedTasks.length,
        remindersScheduled,
        tasks: insertedTasks,
      });
    } catch (error) {
      console.error("Error generating timeline:", error);
      // Redirect with error for form submissions
      const contentType = c.req.header("content-type") || "";
      if (!contentType.includes("application/json")) {
        return c.redirect(`/parties/${partyId}/timeline?error=generation-failed`);
      }
      return c.json({ error: "Failed to generate timeline" }, 500);
    }
  })

  // ==================== REMINDERS ====================

  // POST /api/parties/:id/reminders/schedule - Schedule reminders with Durable Object
  .post("/:id/reminders/schedule", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    // Get user info
    const [userRecord] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id));

    if (!userRecord) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if user has calendar sync
    const [calendarConn] = await db
      .select()
      .from(calendarConnections)
      .where(eq(calendarConnections.userId, user.id));

    const hasCalendarSync = !!calendarConn;

    // Get timeline tasks with recipe info
    const tasks = await db
      .select({
        id: timelineTasks.id,
        description: timelineTasks.description,
        scheduledDate: timelineTasks.scheduledDate,
        scheduledTime: timelineTasks.scheduledTime,
        durationMinutes: timelineTasks.durationMinutes,
        recipeName: recipes.name,
        prepTimeMinutes: recipes.prepTimeMinutes,
      })
      .from(timelineTasks)
      .leftJoin(recipes, eq(timelineTasks.recipeId, recipes.id))
      .where(and(eq(timelineTasks.partyId, partyId), eq(timelineTasks.completed, false)));

    // Check if Durable Object is available
    if (!c.env.PARTY_REMINDER) {
      console.warn("PARTY_REMINDER Durable Object not available");
      return c.json({
        scheduled: 0,
        warning: "Reminder scheduling not available - Durable Object not configured",
        hasCalendarSync,
      });
    }

    try {
      const doId = c.env.PARTY_REMINDER.idFromName(partyId);
      const stub = c.env.PARTY_REMINDER.get(doId);

      const taskData = tasks.map((task) => ({
        id: task.id,
        description: task.description,
        scheduledDate: task.scheduledDate.getTime(),
        scheduledTime: task.scheduledTime,
        durationMinutes: task.durationMinutes,
        recipeName: task.recipeName,
        requiresAdvancePrep: (task.prepTimeMinutes || 0) > 60,
        advancePrepHours: task.prepTimeMinutes ? Math.ceil(task.prepTimeMinutes / 60) : undefined,
      }));

      const response = await stub.fetch("http://internal/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partyId,
          hostUserId: user.id,
          hostEmail: userRecord.email,
          hostName: userRecord.name,
          partyName: party.name,
          partyDateTime: party.dateTime.getTime(),
          partyLocation: party.location,
          shareToken: party.shareToken,
          hasCalendarSync,
          tasks: taskData,
        }),
      });

      if (!response.ok) {
        throw new Error(`DO returned ${response.status}`);
      }

      const result = (await response.json()) as { scheduled: number };

      return c.json({
        scheduled: result.scheduled,
        hasCalendarSync,
      });
    } catch (err) {
      console.error("Error scheduling reminders:", err);
      return c.json({ error: "Failed to schedule reminders" }, 500);
    }
  })

  // DELETE /api/parties/:id/reminders/schedule - Cancel all reminders
  .delete("/:id/reminders/schedule", async (c) => {
    const user = getUser(c);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const partyId = c.req.param("id");
    const db = c.get("db");

    const party = await verifyPartyOwnership(db, partyId, user.id);
    if (!party) {
      return c.json({ error: "Party not found" }, 404);
    }

    if (!c.env.PARTY_REMINDER) {
      return c.json({ cancelled: true });
    }

    try {
      const doId = c.env.PARTY_REMINDER.idFromName(partyId);
      const stub = c.env.PARTY_REMINDER.get(doId);

      await stub.fetch("http://internal/cancel", { method: "POST" });

      return c.json({ cancelled: true });
    } catch (err) {
      console.error("Error cancelling reminders:", err);
      return c.json({ error: "Failed to cancel reminders" }, 500);
    }
  });

// Export type for client
export type PartiesRoutes = typeof partiesRoutes;
export { partiesRoutes };
