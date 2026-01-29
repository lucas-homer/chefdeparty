import { nanoid } from "nanoid";

// Test users
export const testUsers = {
  host: {
    id: "test-host-id",
    email: "host@test.com",
    name: "Test Host",
  },
  guest: {
    id: "test-guest-id",
    email: "guest@test.com",
    name: "Test Guest",
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
    shareToken: nanoid(10),
  },
};

// Test guests
export const testGuests = [
  {
    id: "test-guest-1",
    partyId: testParties.upcoming.id,
    email: "alice@test.com",
    name: "Alice",
    rsvpStatus: "yes" as const,
    headcount: 2,
    dietaryRestrictions: ["vegetarian"],
  },
  {
    id: "test-guest-2",
    partyId: testParties.upcoming.id,
    email: "bob@test.com",
    name: "Bob",
    rsvpStatus: "yes" as const,
    headcount: 1,
    dietaryRestrictions: ["gluten-free"],
  },
  {
    id: "test-guest-3",
    partyId: testParties.upcoming.id,
    email: "carol@test.com",
    name: "Carol",
    rsvpStatus: "maybe" as const,
    headcount: 1,
    dietaryRestrictions: ["nut allergy"],
  },
];

// Test recipes
export const testRecipes = [
  {
    id: "test-recipe-1",
    ownerId: testUsers.host.id,
    name: "Vegetarian Pasta",
    description: "A delicious vegetarian pasta dish",
    sourceType: "manual" as const,
    ingredients: [
      { name: "pasta", quantity: "1", unit: "lb" },
      { name: "tomatoes", quantity: "2", unit: "cups" },
      { name: "basil", quantity: "1/4", unit: "cup" },
      { name: "garlic", quantity: "3", unit: "cloves" },
      { name: "olive oil", quantity: "2", unit: "tbsp" },
    ],
    instructions: [
      "Boil water and cook pasta according to package directions",
      "Sauté garlic in olive oil",
      "Add tomatoes and simmer for 10 minutes",
      "Toss with pasta and fresh basil",
    ],
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 4,
  },
  {
    id: "test-recipe-2",
    ownerId: testUsers.host.id,
    name: "Chocolate Cake",
    description: "Rich chocolate cake (contains nuts)",
    sourceType: "manual" as const,
    ingredients: [
      { name: "flour", quantity: "2", unit: "cups" },
      { name: "sugar", quantity: "1.5", unit: "cups" },
      { name: "cocoa powder", quantity: "3/4", unit: "cup" },
      { name: "eggs", quantity: "3" },
      { name: "walnuts", quantity: "1", unit: "cup", notes: "chopped" },
    ],
    instructions: [
      "Preheat oven to 350°F",
      "Mix dry ingredients",
      "Add wet ingredients and mix until smooth",
      "Fold in walnuts",
      "Bake for 35-40 minutes",
    ],
    prepTimeMinutes: 15,
    cookTimeMinutes: 40,
    servings: 8,
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
  },
];
