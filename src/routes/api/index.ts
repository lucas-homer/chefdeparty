import { Hono } from "hono";
import { recipesRoutes } from "./recipes";
import { partiesRoutes } from "./parties";
import { calendarRoutes } from "./calendar";
import { inviteRoutes } from "./invite";
import { inviteCodesRoutes } from "./invite-codes";
import type { Env } from "../../index";
import type { createDb } from "../../lib/db";

type Variables = {
  db: ReturnType<typeof createDb>;
};

type AppContext = { Bindings: Env; Variables: Variables };

// Create combined API router with proper chaining for type inference
const apiRoutes = new Hono<AppContext>()
  .route("/recipes", recipesRoutes)
  .route("/parties", partiesRoutes)
  .route("/calendar", calendarRoutes)
  .route("/invite", inviteRoutes)
  .route("/invite-codes", inviteCodesRoutes);

// Export aggregated type for client
export type ApiRoutes = typeof apiRoutes;
export { apiRoutes };

// Re-export individual route types for granular usage
export type { RecipesRoutes } from "./recipes";
export type { PartiesRoutes } from "./parties";
export type { CalendarRoutes } from "./calendar";
export type { InviteRoutes } from "./invite";
export type { InviteCodesRoutes } from "./invite-codes";
