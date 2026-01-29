import { defineConfig } from "drizzle-kit";

// Local config for generating migrations (no remote credentials needed)
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "sqlite",
});
