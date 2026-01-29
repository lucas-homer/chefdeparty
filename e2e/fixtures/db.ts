// Database helpers for E2E tests
// This will be expanded when we have the actual D1 setup

import {
  testUsers,
  testParties,
  testGuests,
  testRecipes,
  testTimelineTasks,
} from "./seed-data";

export async function resetAndSeedDatabase() {
  // In E2E tests, we'll use wrangler's local D1
  // This function will:
  // 1. Clear all tables
  // 2. Insert test data

  console.log("Resetting and seeding database...");

  // TODO: Implement actual D1 seeding when running E2E tests
  // For now, just log what would be seeded
  console.log("Would seed:", {
    users: Object.values(testUsers).length,
    parties: Object.values(testParties).length,
    guests: testGuests.length,
    recipes: testRecipes.length,
    timelineTasks: testTimelineTasks.length,
  });
}

export async function clearDatabase() {
  console.log("Clearing database...");
  // TODO: Implement actual D1 clearing
}

export { testUsers, testParties, testGuests, testRecipes, testTimelineTasks };
