import { resetAndSeedDatabase } from "./fixtures/db";

export default async function globalSetup() {
  console.log("Running global E2E setup...");

  // Reset and seed the database before running tests
  await resetAndSeedDatabase();

  console.log("Global E2E setup complete");
}
