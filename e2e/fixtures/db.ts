/**
 * Database helpers for E2E tests.
 * Uses wrangler's local D1 database for seeding.
 */

import { execSync } from "child_process";
import {
  testUsers,
  testParties,
  testGuests,
  testRecipes,
  testContributionItems,
  testTimelineTasks,
  testSessions,
} from "./seed-data";

/**
 * Execute SQL against the local D1 database using wrangler CLI.
 */
function execSql(sql: string): void {
  try {
    // Escape single quotes in SQL for shell
    const escapedSql = sql.replace(/'/g, "'\\''");
    execSync(`npx wrangler d1 execute DB --local --command='${escapedSql}'`, {
      stdio: "pipe",
      cwd: process.cwd(),
    });
  } catch (error) {
    console.error("Failed to execute SQL:", sql.slice(0, 100) + "...");
    throw error;
  }
}

/**
 * Clear all data from the database tables.
 * Deletes in order to respect foreign key constraints.
 */
export async function clearDatabase(): Promise<void> {
  console.log("Clearing database...");

  const tables = [
    "scheduled_reminders",
    "timeline_tasks",
    "party_menu",
    "contribution_items",
    "guests",
    "recipes",
    "parties",
    "sessions",
    "accounts",
    "verification_tokens",
    "invite_code_uses",
    "pending_invites",
    "invite_codes",
    "calendar_connections",
    "phone_verification_tokens",
    "rate_limits",
    "sms_opt_outs",
    "users",
  ];

  for (const table of tables) {
    try {
      execSql(`DELETE FROM ${table}`);
    } catch {
      // Table might not exist yet, that's OK
    }
  }

  console.log("Database cleared.");
}

/**
 * Seed the database with test data.
 */
export async function seedDatabase(): Promise<void> {
  console.log("Seeding database...");

  // Insert users
  for (const user of Object.values(testUsers)) {
    execSql(`
      INSERT INTO users (id, email, name, image, email_verified, created_at)
      VALUES (
        '${user.id}',
        '${user.email}',
        '${user.name}',
        ${user.image ? `'${user.image}'` : "NULL"},
        ${user.emailVerified ? Math.floor(user.emailVerified.getTime() / 1000) : "NULL"},
        ${Math.floor(user.createdAt.getTime() / 1000)}
      )
    `);
  }
  console.log(`Seeded ${Object.values(testUsers).length} users`);

  // Insert sessions for auth bypass
  for (const session of Object.values(testSessions)) {
    execSql(`
      INSERT INTO sessions (session_token, user_id, expires)
      VALUES (
        '${session.sessionToken}',
        '${session.userId}',
        ${Math.floor(session.expires.getTime() / 1000)}
      )
    `);
  }
  console.log(`Seeded ${Object.values(testSessions).length} sessions`);

  // Insert parties
  for (const party of Object.values(testParties)) {
    execSql(`
      INSERT INTO parties (id, host_id, name, description, date_time, location, share_token, created_at)
      VALUES (
        '${party.id}',
        '${party.hostId}',
        '${party.name.replace(/'/g, "''")}',
        ${party.description ? `'${party.description.replace(/'/g, "''")}'` : "NULL"},
        ${Math.floor(party.dateTime.getTime() / 1000)},
        ${party.location ? `'${party.location.replace(/'/g, "''")}'` : "NULL"},
        '${party.shareToken}',
        ${Math.floor(party.createdAt.getTime() / 1000)}
      )
    `);
  }
  console.log(`Seeded ${Object.values(testParties).length} parties`);

  // Insert guests
  for (const guest of testGuests) {
    execSql(`
      INSERT INTO guests (id, party_id, user_id, email, name, rsvp_status, headcount, dietary_restrictions, created_at)
      VALUES (
        '${guest.id}',
        '${guest.partyId}',
        ${guest.userId ? `'${guest.userId}'` : "NULL"},
        '${guest.email}',
        ${guest.name ? `'${guest.name}'` : "NULL"},
        '${guest.rsvpStatus}',
        ${guest.headcount},
        ${guest.dietaryRestrictions ? `'${JSON.stringify(guest.dietaryRestrictions)}'` : "NULL"},
        ${Math.floor(guest.createdAt.getTime() / 1000)}
      )
    `);
  }
  console.log(`Seeded ${testGuests.length} guests`);

  // Insert contribution items
  for (const item of testContributionItems) {
    execSql(`
      INSERT INTO contribution_items (id, party_id, description, claimed_by_guest_id, created_at)
      VALUES (
        '${item.id}',
        '${item.partyId}',
        '${item.description.replace(/'/g, "''")}',
        ${item.claimedByGuestId ? `'${item.claimedByGuestId}'` : "NULL"},
        ${Math.floor(item.createdAt.getTime() / 1000)}
      )
    `);
  }
  console.log(`Seeded ${testContributionItems.length} contribution items`);

  // Insert recipes
  for (const recipe of testRecipes) {
    execSql(`
      INSERT INTO recipes (
        id, owner_id, name, description, source_url, source_type, copied_from_id, share_token,
        ingredients, instructions, prep_time_minutes, cook_time_minutes, servings,
        tags, dietary_tags, created_at, updated_at
      )
      VALUES (
        '${recipe.id}',
        '${recipe.ownerId}',
        '${recipe.name.replace(/'/g, "''")}',
        ${recipe.description ? `'${recipe.description.replace(/'/g, "''")}'` : "NULL"},
        ${recipe.sourceUrl ? `'${recipe.sourceUrl}'` : "NULL"},
        '${recipe.sourceType}',
        ${recipe.copiedFromId ? `'${recipe.copiedFromId}'` : "NULL"},
        '${recipe.shareToken}',
        '${JSON.stringify(recipe.ingredients).replace(/'/g, "''")}',
        '${JSON.stringify(recipe.instructions).replace(/'/g, "''")}',
        ${recipe.prepTimeMinutes ?? "NULL"},
        ${recipe.cookTimeMinutes ?? "NULL"},
        ${recipe.servings ?? "NULL"},
        ${recipe.tags ? `'${JSON.stringify(recipe.tags)}'` : "NULL"},
        ${recipe.dietaryTags ? `'${JSON.stringify(recipe.dietaryTags)}'` : "NULL"},
        ${Math.floor(recipe.createdAt.getTime() / 1000)},
        ${Math.floor(recipe.updatedAt.getTime() / 1000)}
      )
    `);
  }
  console.log(`Seeded ${testRecipes.length} recipes`);

  // Insert timeline tasks
  for (const task of testTimelineTasks) {
    execSql(`
      INSERT INTO timeline_tasks (
        id, party_id, recipe_id, description, scheduled_date, scheduled_time,
        duration_minutes, completed, sort_order, is_phase_start, phase_description,
        google_calendar_event_id, created_at
      )
      VALUES (
        '${task.id}',
        '${task.partyId}',
        ${task.recipeId ? `'${task.recipeId}'` : "NULL"},
        '${task.description.replace(/'/g, "''")}',
        ${Math.floor(task.scheduledDate.getTime() / 1000)},
        ${task.scheduledTime ? `'${task.scheduledTime}'` : "NULL"},
        ${task.durationMinutes ?? "NULL"},
        ${task.completed ? 1 : 0},
        ${task.sortOrder ?? "NULL"},
        ${task.isPhaseStart ? 1 : 0},
        ${task.phaseDescription ? `'${task.phaseDescription.replace(/'/g, "''")}'` : "NULL"},
        ${task.googleCalendarEventId ? `'${task.googleCalendarEventId}'` : "NULL"},
        ${Math.floor(task.createdAt.getTime() / 1000)}
      )
    `);
  }
  console.log(`Seeded ${testTimelineTasks.length} timeline tasks`);

  console.log("Database seeded successfully!");
}

/**
 * Reset and seed the database.
 * Call this in global setup before running E2E tests.
 */
export async function resetAndSeedDatabase(): Promise<void> {
  console.log("Resetting and seeding database...");

  await clearDatabase();
  await seedDatabase();

  console.log("Database reset and seeded.");
}

// Re-export test data for use in tests
export {
  testUsers,
  testParties,
  testGuests,
  testRecipes,
  testContributionItems,
  testTimelineTasks,
  testSessions,
};
