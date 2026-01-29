import { describe, it, expect } from "vitest";
import {
  createRecipeSchema,
  createPartySchema,
  createGuestSchema,
  ingredientSchema,
  instructionSchema,
  rsvpStatusSchema,
} from "./schemas";

describe("ingredientSchema", () => {
  it("validates a valid ingredient", () => {
    const result = ingredientSchema.safeParse({
      amount: "2",
      unit: "cups",
      ingredient: "flour",
    });
    expect(result.success).toBe(true);
  });

  it("allows optional fields", () => {
    const result = ingredientSchema.safeParse({
      ingredient: "salt",
    });
    expect(result.success).toBe(true);
  });

  it("requires ingredient name", () => {
    const result = ingredientSchema.safeParse({
      amount: "1",
      unit: "cup",
    });
    expect(result.success).toBe(false);
  });
});

describe("instructionSchema", () => {
  it("validates a valid instruction", () => {
    const result = instructionSchema.safeParse({
      step: 1,
      description: "Mix the ingredients",
    });
    expect(result.success).toBe(true);
  });

  it("requires step number", () => {
    const result = instructionSchema.safeParse({
      description: "Mix the ingredients",
    });
    expect(result.success).toBe(false);
  });
});

describe("createRecipeSchema", () => {
  it("validates a complete recipe", () => {
    const result = createRecipeSchema.safeParse({
      name: "Chocolate Cake",
      description: "A rich chocolate cake",
      ingredients: [
        { amount: "2", unit: "cups", ingredient: "flour" },
        { amount: "1", unit: "cup", ingredient: "sugar" },
      ],
      instructions: [
        { step: 1, description: "Preheat oven to 350°F" },
        { step: 2, description: "Mix dry ingredients" },
      ],
      prepTimeMinutes: 15,
      cookTimeMinutes: 45,
      servings: 8,
    });
    expect(result.success).toBe(true);
  });

  it("requires a name", () => {
    const result = createRecipeSchema.safeParse({
      ingredients: [],
      instructions: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod returns "Required" for missing fields, custom message only for empty string
      expect(result.error.issues.some(i => i.path.includes("name"))).toBe(true);
    }
  });

  it("validates dietary tags", () => {
    const result = createRecipeSchema.safeParse({
      name: "Vegan Salad",
      ingredients: [{ ingredient: "lettuce" }],
      instructions: [{ step: 1, description: "Chop lettuce" }],
      dietaryTags: ["vegan", "gluten-free"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid dietary tags", () => {
    const result = createRecipeSchema.safeParse({
      name: "Test Recipe",
      ingredients: [],
      instructions: [],
      dietaryTags: ["invalid-tag"],
    });
    expect(result.success).toBe(false);
  });
});

describe("createPartySchema", () => {
  it("validates a complete party", () => {
    const result = createPartySchema.safeParse({
      name: "Birthday Party",
      description: "A fun celebration",
      dateTime: new Date("2025-06-15T18:00:00"),
      location: "123 Main St",
    });
    expect(result.success).toBe(true);
  });

  it("coerces date strings to Date objects", () => {
    const result = createPartySchema.safeParse({
      name: "Party",
      dateTime: "2025-06-15T18:00:00Z",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateTime).toBeInstanceOf(Date);
    }
  });

  it("requires a name", () => {
    const result = createPartySchema.safeParse({
      dateTime: new Date(),
    });
    expect(result.success).toBe(false);
  });
});

describe("createGuestSchema", () => {
  it("validates a complete guest", () => {
    const result = createGuestSchema.safeParse({
      name: "Alice Smith",
      email: "alice@example.com",
      rsvpStatus: "yes",
      headcount: 2,
      dietaryRestrictions: ["vegetarian"],
    });
    expect(result.success).toBe(true);
  });

  it("requires valid email", () => {
    const result = createGuestSchema.safeParse({
      name: "Bob",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Please provide a valid email");
    }
  });

  it("allows minimal guest data", () => {
    const result = createGuestSchema.safeParse({
      email: "guest@example.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("rsvpStatusSchema", () => {
  it("accepts valid RSVP statuses", () => {
    expect(rsvpStatusSchema.safeParse("pending").success).toBe(true);
    expect(rsvpStatusSchema.safeParse("yes").success).toBe(true);
    expect(rsvpStatusSchema.safeParse("no").success).toBe(true);
    expect(rsvpStatusSchema.safeParse("maybe").success).toBe(true);
  });

  it("rejects invalid RSVP statuses", () => {
    expect(rsvpStatusSchema.safeParse("unknown").success).toBe(false);
    expect(rsvpStatusSchema.safeParse("").success).toBe(false);
  });
});
