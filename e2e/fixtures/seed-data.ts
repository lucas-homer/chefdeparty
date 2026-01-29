import { nanoid } from "nanoid";
import type { Ingredient, Instruction } from "../../drizzle/schema";

// Stable share token for consistent test URLs
const SHARE_TOKEN = "e2etestok";

// Session token for authenticated tests (used to bypass auth)
export const TEST_SESSION_TOKEN = "e2e-test-session-token";

// Test users
export const testUsers = {
  host: {
    id: "test-host-id",
    email: "host@test.com",
    name: "Test Host",
    image: null,
    emailVerified: new Date(),
    createdAt: new Date(),
  },
  guest: {
    id: "test-guest-id",
    email: "guest@test.com",
    name: "Test Guest",
    image: null,
    emailVerified: new Date(),
    createdAt: new Date(),
  },
};

// Test session (for auth bypass in E2E tests)
export const testSessions = {
  host: {
    sessionToken: TEST_SESSION_TOKEN,
    userId: testUsers.host.id,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  },
};

// Test parties
export const testParties = {
  upcoming: {
    id: "test-party-upcoming",
    hostId: testUsers.host.id,
    name: "Test Dinner Party",
    description: "A test dinner party for E2E testing",
    dateTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
    location: "123 Test Street",
    shareToken: SHARE_TOKEN,
    createdAt: new Date(),
  },
};

// Test guests
export const testGuests = [
  {
    id: "test-guest-1",
    partyId: testParties.upcoming.id,
    userId: null,
    email: "alice@test.com",
    name: "Alice",
    rsvpStatus: "yes" as const,
    headcount: 2,
    dietaryRestrictions: ["vegetarian"],
    createdAt: new Date(),
  },
  {
    id: "test-guest-2",
    partyId: testParties.upcoming.id,
    userId: null,
    email: "bob@test.com",
    name: "Bob",
    rsvpStatus: "yes" as const,
    headcount: 1,
    dietaryRestrictions: ["gluten-free"],
    createdAt: new Date(),
  },
  {
    id: "test-guest-3",
    partyId: testParties.upcoming.id,
    userId: null,
    email: "carol@test.com",
    name: "Carol",
    rsvpStatus: "maybe" as const,
    headcount: 1,
    dietaryRestrictions: ["nut allergy"],
    createdAt: new Date(),
  },
];

// Test recipes - using correct Ingredient and Instruction types
export const testRecipes = [
  {
    id: "test-recipe-1",
    ownerId: testUsers.host.id,
    name: "Vegetarian Pasta",
    description: "A delicious vegetarian pasta dish",
    sourceUrl: null,
    sourceType: "manual" as const,
    copiedFromId: null,
    shareToken: nanoid(8),
    ingredients: [
      { amount: "1", unit: "lb", ingredient: "pasta" },
      { amount: "2", unit: "cups", ingredient: "tomatoes" },
      { amount: "1/4", unit: "cup", ingredient: "basil" },
      { amount: "3", unit: "cloves", ingredient: "garlic" },
      { amount: "2", unit: "tbsp", ingredient: "olive oil" },
    ] as Ingredient[],
    instructions: [
      { step: 1, description: "Boil water and cook pasta according to package directions" },
      { step: 2, description: "Sauté garlic in olive oil" },
      { step: 3, description: "Add tomatoes and simmer for 10 minutes" },
      { step: 4, description: "Toss with pasta and fresh basil" },
    ] as Instruction[],
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 4,
    tags: ["pasta", "vegetarian"],
    dietaryTags: ["vegetarian" as const],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "test-recipe-2",
    ownerId: testUsers.host.id,
    name: "Chocolate Cake",
    description: "Rich chocolate cake (contains nuts)",
    sourceUrl: null,
    sourceType: "manual" as const,
    copiedFromId: null,
    shareToken: nanoid(8),
    ingredients: [
      { amount: "2", unit: "cups", ingredient: "flour" },
      { amount: "1.5", unit: "cups", ingredient: "sugar" },
      { amount: "3/4", unit: "cup", ingredient: "cocoa powder" },
      { amount: "3", ingredient: "eggs" },
      { amount: "1", unit: "cup", ingredient: "walnuts", notes: "chopped" },
    ] as Ingredient[],
    instructions: [
      { step: 1, description: "Preheat oven to 350°F" },
      { step: 2, description: "Mix dry ingredients" },
      { step: 3, description: "Add wet ingredients and mix until smooth" },
      { step: 4, description: "Fold in walnuts" },
      { step: 5, description: "Bake for 35-40 minutes" },
    ] as Instruction[],
    prepTimeMinutes: 15,
    cookTimeMinutes: 40,
    servings: 8,
    tags: ["dessert", "baking"],
    dietaryTags: ["contains-nuts" as const],
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Test timeline tasks
export const testTimelineTasks = [
  {
    id: "test-task-1",
    partyId: testParties.upcoming.id,
    recipeId: testRecipes[1].id,
    description: "Bake chocolate cake",
    scheduledDate: new Date(testParties.upcoming.dateTime.getTime() - 24 * 60 * 60 * 1000), // Day before
    scheduledTime: "14:00",
    durationMinutes: 60,
    completed: false,
    sortOrder: 1,
    isPhaseStart: true,
    phaseDescription: "Dessert prep day",
    googleCalendarEventId: null,
    createdAt: new Date(),
  },
  {
    id: "test-task-2",
    partyId: testParties.upcoming.id,
    recipeId: testRecipes[0].id,
    description: "Prep vegetables for pasta",
    scheduledDate: testParties.upcoming.dateTime,
    scheduledTime: "16:00",
    durationMinutes: 15,
    completed: false,
    sortOrder: 2,
    isPhaseStart: true,
    phaseDescription: "Start main course prep",
    googleCalendarEventId: null,
    createdAt: new Date(),
  },
  {
    id: "test-task-3",
    partyId: testParties.upcoming.id,
    recipeId: testRecipes[0].id,
    description: "Cook pasta and sauce",
    scheduledDate: testParties.upcoming.dateTime,
    scheduledTime: "17:30",
    durationMinutes: 30,
    completed: false,
    sortOrder: 3,
    isPhaseStart: false,
    phaseDescription: null,
    googleCalendarEventId: null,
    createdAt: new Date(),
  },
];
