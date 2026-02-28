import { describe, it, expect } from "vitest";
import {
  serializePartyInfo,
  serializeGuestList,
  serializeMenuPlan,
  serializeTimeline,
  deserializePartyInfo,
  deserializeGuestList,
  deserializeMenuPlan,
  deserializeTimeline,
  deserializeWizardSession,
} from "./wizard-session-serialization";
import type { PartyInfoData, GuestData, MenuPlanData, TimelineTaskData } from "./wizard-schemas";
import type { WizardSession } from "../../drizzle/schema";

describe("wizard-session-serialization", () => {
  // ============================================
  // Party Info
  // ============================================

  describe("serializePartyInfo", () => {
    it("converts Date to ISO string", () => {
      const date = new Date("2025-07-04T18:00:00.000Z");
      const data: PartyInfoData = {
        name: "July 4th BBQ",
        dateTime: date,
        location: "Backyard",
        description: "Annual BBQ",
        allowContributions: true,
      };

      const result = serializePartyInfo(data);

      expect(result.name).toBe("July 4th BBQ");
      expect(result.dateTime).toBe("2025-07-04T18:00:00.000Z");
      expect(result.location).toBe("Backyard");
      expect(result.description).toBe("Annual BBQ");
      expect(result.allowContributions).toBe(true);
    });

    it("handles dateTime that is already a string", () => {
      const data = {
        name: "Test Party",
        dateTime: "2025-12-25T19:00:00.000Z" as unknown as Date,
        allowContributions: false,
      };

      const result = serializePartyInfo(data);
      expect(result.dateTime).toBe("2025-12-25T19:00:00.000Z");
    });

    it("preserves optional fields as undefined", () => {
      const data: PartyInfoData = {
        name: "Minimal Party",
        dateTime: new Date("2025-06-01T12:00:00Z"),
        allowContributions: false,
      };

      const result = serializePartyInfo(data);
      expect(result.location).toBeUndefined();
      expect(result.description).toBeUndefined();
    });
  });

  describe("deserializePartyInfo", () => {
    it("converts ISO string back to Date", () => {
      const result = deserializePartyInfo({
        name: "July 4th BBQ",
        dateTime: "2025-07-04T18:00:00.000Z",
        location: "Backyard",
        description: "Annual BBQ",
        allowContributions: true,
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe("July 4th BBQ");
      expect(result!.dateTime).toBeInstanceOf(Date);
      expect(result!.dateTime.toISOString()).toBe("2025-07-04T18:00:00.000Z");
      expect(result!.allowContributions).toBe(true);
    });

    it("returns null for null input", () => {
      expect(deserializePartyInfo(null)).toBeNull();
    });

    it("defaults allowContributions to false when missing", () => {
      const result = deserializePartyInfo({
        name: "Test",
        dateTime: "2025-01-01T00:00:00.000Z",
      });
      expect(result!.allowContributions).toBe(false);
    });
  });

  describe("partyInfo round-trip", () => {
    it("serialize then deserialize produces equivalent data", () => {
      const original: PartyInfoData = {
        name: "Birthday Bash",
        dateTime: new Date("2025-08-15T20:00:00.000Z"),
        location: "123 Main St",
        description: "Surprise party!",
        allowContributions: true,
      };

      const roundTripped = deserializePartyInfo(serializePartyInfo(original));

      expect(roundTripped).not.toBeNull();
      expect(roundTripped!.name).toBe(original.name);
      expect(roundTripped!.dateTime.getTime()).toBe(original.dateTime.getTime());
      expect(roundTripped!.location).toBe(original.location);
      expect(roundTripped!.description).toBe(original.description);
      expect(roundTripped!.allowContributions).toBe(original.allowContributions);
    });
  });

  // ============================================
  // Guest List
  // ============================================

  describe("serializeGuestList", () => {
    it("serializes array of guests", () => {
      const guests: GuestData[] = [
        { name: "Alice", email: "alice@test.com" },
        { name: "Bob", phone: "+15551234567" },
        { name: "Charlie" },
      ];

      const result = serializeGuestList(guests);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ name: "Alice", email: "alice@test.com", phone: undefined });
      expect(result[1]).toEqual({ name: "Bob", email: undefined, phone: "+15551234567" });
      expect(result[2]).toEqual({ name: "Charlie", email: undefined, phone: undefined });
    });

    it("serializes empty array", () => {
      expect(serializeGuestList([])).toEqual([]);
    });
  });

  describe("deserializeGuestList", () => {
    it("deserializes array of guests", () => {
      const result = deserializeGuestList([
        { name: "Alice", email: "alice@test.com" },
        { name: "Bob", phone: "+15551234567" },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Alice");
      expect(result[0].email).toBe("alice@test.com");
      expect(result[1].phone).toBe("+15551234567");
    });

    it("returns empty array for null input", () => {
      expect(deserializeGuestList(null)).toEqual([]);
    });
  });

  describe("guestList round-trip", () => {
    it("serialize then deserialize preserves all fields", () => {
      const original: GuestData[] = [
        { name: "Alice", email: "alice@test.com", phone: "+15551234567" },
        { name: "Bob" },
      ];

      const roundTripped = deserializeGuestList(
        serializeGuestList(original) as any
      );

      expect(roundTripped).toHaveLength(2);
      expect(roundTripped[0].name).toBe("Alice");
      expect(roundTripped[0].email).toBe("alice@test.com");
      expect(roundTripped[0].phone).toBe("+15551234567");
      expect(roundTripped[1].name).toBe("Bob");
    });
  });

  // ============================================
  // Menu Plan
  // ============================================

  describe("serializeMenuPlan", () => {
    it("serializes a full menu plan", () => {
      const plan: MenuPlanData = {
        existingRecipes: [
          { recipeId: "r1", name: "Pasta", course: "main", scaledServings: 8 },
        ],
        newRecipes: [
          {
            name: "Caesar Salad",
            description: "Classic salad",
            ingredients: [{ amount: "1", unit: "head", ingredient: "romaine" }],
            instructions: [{ step: 1, text: "Chop lettuce" }],
            course: "appetizer",
            servings: 4,
          },
        ],
        dietaryRestrictions: ["vegetarian"],
        ambitionLevel: "moderate",
        processedUrls: ["https://example.com/recipe"],
        processedImageHashes: ["abc123"],
      };

      const result = serializeMenuPlan(plan);

      expect(result.existingRecipes).toHaveLength(1);
      expect(result.existingRecipes[0].recipeId).toBe("r1");
      expect(result.newRecipes).toHaveLength(1);
      expect(result.newRecipes[0].name).toBe("Caesar Salad");
      expect(result.dietaryRestrictions).toEqual(["vegetarian"]);
      expect(result.ambitionLevel).toBe("moderate");
      expect(result.processedUrls).toEqual(["https://example.com/recipe"]);
      expect(result.processedImageHashes).toEqual(["abc123"]);
    });
  });

  describe("deserializeMenuPlan", () => {
    it("returns null for null input", () => {
      expect(deserializeMenuPlan(null)).toBeNull();
    });

    it("deserializes a full menu plan", () => {
      const serialized = {
        existingRecipes: [
          { recipeId: "r1", name: "Pasta", course: "main", scaledServings: 8 },
        ],
        newRecipes: [
          {
            name: "Salad",
            ingredients: [{ amount: "1", unit: "head", ingredient: "lettuce" }],
            instructions: [{ step: 1, text: "Chop" }],
          },
        ],
        dietaryRestrictions: ["gluten-free"],
        ambitionLevel: "simple",
      };

      const result = deserializeMenuPlan(serialized as any);

      expect(result).not.toBeNull();
      expect(result!.existingRecipes).toHaveLength(1);
      expect(result!.newRecipes).toHaveLength(1);
      expect(result!.ambitionLevel).toBe("simple");
    });
  });

  describe("menuPlan round-trip", () => {
    it("serialize then deserialize produces equivalent data", () => {
      const original: MenuPlanData = {
        existingRecipes: [
          { recipeId: "r1", name: "Pasta", course: "main", scaledServings: 8 },
        ],
        newRecipes: [
          {
            name: "Bruschetta",
            ingredients: [{ amount: "4", unit: "slices", ingredient: "bread" }],
            instructions: [{ step: 1, text: "Toast bread" }],
            course: "appetizer",
            prepTimeMinutes: 10,
            cookTimeMinutes: 5,
            servings: 4,
            tags: ["italian"],
            dietaryTags: ["vegetarian"],
          },
        ],
        processedUrls: ["https://example.com"],
        processedImageHashes: [],
      };

      const roundTripped = deserializeMenuPlan(serializeMenuPlan(original) as any);

      expect(roundTripped!.existingRecipes[0].recipeId).toBe("r1");
      expect(roundTripped!.existingRecipes[0].course).toBe("main");
      expect(roundTripped!.newRecipes[0].name).toBe("Bruschetta");
      expect(roundTripped!.newRecipes[0].prepTimeMinutes).toBe(10);
      expect(roundTripped!.processedUrls).toEqual(["https://example.com"]);
    });
  });

  // ============================================
  // Timeline
  // ============================================

  describe("serializeTimeline", () => {
    it("serializes timeline tasks", () => {
      const tasks: TimelineTaskData[] = [
        {
          recipeId: "r1",
          recipeName: "Pasta",
          description: "Boil water",
          daysBeforeParty: 0,
          scheduledTime: "17:00",
          durationMinutes: 15,
          isPhaseStart: true,
          phaseDescription: "Start cooking",
        },
        {
          description: "Set table",
          daysBeforeParty: 0,
          scheduledTime: "18:00",
          durationMinutes: 20,
          isPhaseStart: false,
        },
      ];

      const result = serializeTimeline(tasks);

      expect(result).toHaveLength(2);
      expect(result[0].recipeId).toBe("r1");
      expect(result[0].isPhaseStart).toBe(true);
      expect(result[0].phaseDescription).toBe("Start cooking");
      expect(result[1].recipeId).toBeUndefined();
      expect(result[1].isPhaseStart).toBe(false);
    });
  });

  describe("deserializeTimeline", () => {
    it("returns null for null input", () => {
      expect(deserializeTimeline(null)).toBeNull();
    });

    it("deserializes timeline tasks", () => {
      const result = deserializeTimeline([
        {
          recipeId: "r1",
          recipeName: "Pasta",
          description: "Cook pasta",
          daysBeforeParty: 0,
          scheduledTime: "17:30",
          durationMinutes: 20,
          isPhaseStart: true,
          phaseDescription: "Main course prep",
        },
      ]);

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].isPhaseStart).toBe(true);
    });

    it("defaults isPhaseStart to false when missing from serialized data", () => {
      const result = deserializeTimeline([
        {
          description: "Clean up",
          daysBeforeParty: 0,
          scheduledTime: "21:00",
          durationMinutes: 30,
        },
      ] as any);

      expect(result![0].isPhaseStart).toBe(false);
    });
  });

  describe("timeline round-trip", () => {
    it("serialize then deserialize preserves all fields", () => {
      const original: TimelineTaskData[] = [
        {
          recipeId: "r1",
          recipeName: "Roast Chicken",
          description: "Prep the chicken",
          daysBeforeParty: 1,
          scheduledTime: "14:00",
          durationMinutes: 30,
          isPhaseStart: true,
          phaseDescription: "Day-before prep",
        },
        {
          description: "Buy groceries",
          daysBeforeParty: 2,
          scheduledTime: "10:00",
          durationMinutes: 60,
          isPhaseStart: false,
        },
      ];

      const roundTripped = deserializeTimeline(serializeTimeline(original) as any);

      expect(roundTripped).toHaveLength(2);
      expect(roundTripped![0].recipeId).toBe("r1");
      expect(roundTripped![0].recipeName).toBe("Roast Chicken");
      expect(roundTripped![0].daysBeforeParty).toBe(1);
      expect(roundTripped![0].isPhaseStart).toBe(true);
      expect(roundTripped![1].isPhaseStart).toBe(false);
    });
  });

  // ============================================
  // Full Session
  // ============================================

  describe("deserializeWizardSession", () => {
    it("deserializes a complete wizard session row", () => {
      const row: WizardSession = {
        id: "session-1",
        userId: "user-1",
        currentStep: "guests",
        furthestStepIndex: 1,
        partyInfo: {
          name: "Test Party",
          dateTime: "2025-07-04T18:00:00.000Z",
          location: "Home",
        },
        guestList: [
          { name: "Alice", email: "alice@test.com" },
        ],
        menuPlan: null,
        timeline: null,
        status: "active",
        partyId: null,
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
      };

      const result = deserializeWizardSession(row);

      expect(result.id).toBe("session-1");
      expect(result.currentStep).toBe("guests");
      expect(result.furthestStepIndex).toBe(1);
      expect(result.partyInfo).not.toBeNull();
      expect(result.partyInfo!.dateTime).toBeInstanceOf(Date);
      expect(result.guestList).toHaveLength(1);
      expect(result.guestList[0].name).toBe("Alice");
      expect(result.menuPlan).toBeNull();
      expect(result.timeline).toBeNull();
      expect(result.status).toBe("active");
    });

    it("defaults furthestStepIndex to 0 when null", () => {
      const row = {
        id: "session-2",
        userId: "user-1",
        currentStep: "party-info",
        furthestStepIndex: null,
        partyInfo: null,
        guestList: [],
        menuPlan: null,
        timeline: null,
        status: "active",
        partyId: null,
        createdAt: null,
        updatedAt: null,
      } as unknown as WizardSession;

      const result = deserializeWizardSession(row);
      expect(result.furthestStepIndex).toBe(0);
    });

    it("handles a completed session with all data populated", () => {
      const row: WizardSession = {
        id: "session-3",
        userId: "user-1",
        currentStep: "timeline",
        furthestStepIndex: 3,
        partyInfo: {
          name: "Dinner Party",
          dateTime: "2025-09-01T19:00:00.000Z",
          location: "My house",
          description: "A fancy dinner",
          allowContributions: true,
        },
        guestList: [
          { name: "Alice", email: "alice@test.com" },
          { name: "Bob", phone: "+15551234567" },
        ],
        menuPlan: {
          existingRecipes: [{ recipeId: "r1", name: "Pasta", course: "main" }],
          newRecipes: [],
        },
        timeline: [
          {
            description: "Cook pasta",
            daysBeforeParty: 0,
            scheduledTime: "17:00",
            durationMinutes: 30,
            isPhaseStart: true,
            phaseDescription: "Cooking",
          },
        ],
        status: "completed",
        partyId: "party-1",
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-15"),
      };

      const result = deserializeWizardSession(row);

      expect(result.currentStep).toBe("timeline");
      expect(result.furthestStepIndex).toBe(3);
      expect(result.partyInfo!.allowContributions).toBe(true);
      expect(result.guestList).toHaveLength(2);
      expect(result.menuPlan!.existingRecipes).toHaveLength(1);
      expect(result.timeline).toHaveLength(1);
      expect(result.timeline![0].isPhaseStart).toBe(true);
      expect(result.status).toBe("completed");
      expect(result.partyId).toBe("party-1");
    });
  });
});
