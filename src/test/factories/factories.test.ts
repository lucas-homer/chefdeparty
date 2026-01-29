import { describe, it, expect } from "vitest";
import {
  userFactory,
  presetUsers,
  partyFactory,
  recipeFactory,
  guestFactory,
  timelineTaskFactory,
} from "./index";

describe("userFactory", () => {
  it("builds a user with all required fields", () => {
    const user = userFactory.build();

    expect(user.id).toBeDefined();
    expect(user.email).toContain("@");
    expect(user.name).toBeDefined();
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("allows overriding fields", () => {
    const user = userFactory.build({
      id: "custom-id",
      email: "custom@test.com",
    });

    expect(user.id).toBe("custom-id");
    expect(user.email).toBe("custom@test.com");
  });

  it("builds multiple users", () => {
    const users = userFactory.buildMany(3);

    expect(users).toHaveLength(3);
    // Each user should have a unique id
    const ids = users.map((u) => u.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("provides preset users", () => {
    const host = presetUsers.host();
    const guest = presetUsers.guest();
    const admin = presetUsers.admin();

    expect(host.id).toBe("preset-host-id");
    expect(guest.id).toBe("preset-guest-id");
    expect(admin.id).toBe("preset-admin-id");
  });
});

describe("partyFactory", () => {
  it("builds a party with all required fields", () => {
    const party = partyFactory.build();

    expect(party.id).toBeDefined();
    expect(party.hostId).toBeDefined();
    expect(party.name).toBeDefined();
    expect(party.dateTime).toBeInstanceOf(Date);
    expect(party.shareToken).toBeDefined();
  });

  it("builds an upcoming party", () => {
    const party = partyFactory.buildUpcoming();
    const now = new Date();

    expect(party.dateTime.getTime()).toBeGreaterThan(now.getTime());
  });

  it("builds a past party", () => {
    const party = partyFactory.buildPast();
    const now = new Date();

    expect(party.dateTime.getTime()).toBeLessThan(now.getTime());
  });
});

describe("recipeFactory", () => {
  it("builds a recipe with ingredients and instructions", () => {
    const recipe = recipeFactory.build();

    expect(recipe.id).toBeDefined();
    expect(recipe.name).toBeDefined();
    expect(recipe.ingredients.length).toBeGreaterThan(0);
    expect(recipe.instructions.length).toBeGreaterThan(0);
  });

  it("builds ingredients with correct structure", () => {
    const ingredient = recipeFactory.buildIngredient();

    expect(ingredient.ingredient).toBeDefined();
    // amount and unit can be optional
  });

  it("builds instructions with step numbers", () => {
    const instructions = recipeFactory.buildInstructions(3);

    expect(instructions).toHaveLength(3);
    expect(instructions[0].step).toBe(1);
    expect(instructions[1].step).toBe(2);
    expect(instructions[2].step).toBe(3);
  });

  it("builds a vegetarian recipe", () => {
    const recipe = recipeFactory.buildVegetarian();

    expect(recipe.dietaryTags).toContain("vegetarian");
  });

  it("builds a quick recipe", () => {
    const recipe = recipeFactory.buildQuick();
    const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

    expect(totalTime).toBeLessThanOrEqual(30);
    expect(recipe.tags).toContain("quick");
  });
});

describe("guestFactory", () => {
  it("builds a guest with all required fields", () => {
    const guest = guestFactory.build();

    expect(guest.id).toBeDefined();
    expect(guest.partyId).toBeDefined();
    expect(guest.email).toContain("@");
  });

  it("builds a confirmed guest", () => {
    const guest = guestFactory.buildConfirmed();

    expect(guest.rsvpStatus).toBe("yes");
  });

  it("builds a pending guest", () => {
    const guest = guestFactory.buildPending();

    expect(guest.rsvpStatus).toBe("pending");
  });

  it("builds a guest with dietary restrictions", () => {
    const guest = guestFactory.buildWithRestrictions(["vegetarian", "nut allergy"]);

    expect(guest.dietaryRestrictions).toContain("vegetarian");
    expect(guest.dietaryRestrictions).toContain("nut allergy");
  });

  it("builds a party guest list with mixed RSVP statuses", () => {
    const partyId = "test-party-id";
    const guests = guestFactory.buildPartyGuestList(partyId, 6);

    expect(guests).toHaveLength(6);
    expect(guests.every((g) => g.partyId === partyId)).toBe(true);

    // Should have at least one confirmed guest
    expect(guests.some((g) => g.rsvpStatus === "yes")).toBe(true);
    // Should have at least one maybe
    expect(guests.some((g) => g.rsvpStatus === "maybe")).toBe(true);
    // Should have at least one pending
    expect(guests.some((g) => g.rsvpStatus === "pending")).toBe(true);
  });
});

describe("timelineTaskFactory", () => {
  it("builds a timeline task with all required fields", () => {
    const task = timelineTaskFactory.build();

    expect(task.id).toBeDefined();
    expect(task.partyId).toBeDefined();
    expect(task.description).toBeDefined();
    expect(task.scheduledDate).toBeInstanceOf(Date);
    expect(task.scheduledTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it("builds multiple tasks with sequential sort order", () => {
    const tasks = timelineTaskFactory.buildMany(5);

    const sortOrders = tasks.map((t) => t.sortOrder);
    expect(sortOrders).toEqual([1, 2, 3, 4, 5]);
  });

  it("builds a party timeline with structured tasks", () => {
    const partyId = "test-party";
    const partyDate = new Date("2025-06-15T19:00:00");
    const recipeIds = ["recipe-1", "recipe-2"];

    const tasks = timelineTaskFactory.buildPartyTimeline(partyId, partyDate, recipeIds);

    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.partyId === partyId)).toBe(true);

    // Should have some phase-start tasks
    expect(tasks.some((t) => t.isPhaseStart)).toBe(true);
  });
});
