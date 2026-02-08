import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Users (hosts and optionally guests)
export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").unique(), // Nullable - users can sign up with phone only
  name: text("name"),
  image: text("image"),
  emailVerified: integer("email_verified", { mode: "timestamp" }),
  phone: text("phone").unique(), // E.164 format: +14155551234
  phoneVerified: integer("phone_verified", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Auth.js accounts (for OAuth providers)
// Column names must match what @auth/drizzle-adapter expects
export const accounts = sqliteTable("accounts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

// Auth.js sessions
// sessionToken must be primary key for @auth/drizzle-adapter
export const sessions = sqliteTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
});

// Auth.js verification tokens (for magic links)
export const verificationTokens = sqliteTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().unique(),
  expires: integer("expires", { mode: "timestamp" }).notNull(),
});

// Parties
export const parties = sqliteTable("parties", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  hostId: text("host_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  dateTime: integer("date_time", { mode: "timestamp" }).notNull(),
  location: text("location"),
  shareToken: text("share_token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Guests (can be linked to user or standalone)
export const guests = sqliteTable("guests", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id),
  email: text("email"), // Nullable - guest can be invited by phone only
  phone: text("phone"), // E.164 format: +14155551234
  name: text("name"),
  rsvpStatus: text("rsvp_status", {
    enum: ["pending", "yes", "no", "maybe"],
  }).default("pending"),
  headcount: integer("headcount").default(1),
  dietaryRestrictions: text("dietary_restrictions", { mode: "json" }).$type<
    string[]
  >(),
  guestToken: text("guest_token").unique(), // Per-guest invite link token
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Recipes
export const recipes = sqliteTable("recipes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  sourceUrl: text("source_url"),
  sourceType: text("source_type", {
    enum: ["url", "photo", "ai", "manual"],
  }),
  // For copy-on-add: reference to original recipe if this is a copy
  copiedFromId: text("copied_from_id").references(() => recipes.id, {
    onDelete: "set null",
  }),
  // For public sharing
  shareToken: text("share_token").unique(),
  ingredients: text("ingredients", { mode: "json" })
    .notNull()
    .$type<Ingredient[]>(),
  instructions: text("instructions", { mode: "json" })
    .notNull()
    .$type<Instruction[]>(),
  prepTimeMinutes: integer("prep_time_minutes"),
  cookTimeMinutes: integer("cook_time_minutes"),
  servings: integer("servings"),
  tags: text("tags", { mode: "json" }).$type<string[]>(),
  dietaryTags: text("dietary_tags", { mode: "json" }).$type<DietaryTag[]>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Party Menu (recipes for a party)
export const partyMenu = sqliteTable("party_menu", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  recipeId: text("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  scaledServings: integer("scaled_servings"),
  course: text("course", {
    enum: ["appetizer", "main", "side", "dessert", "drink"],
  }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Contribution Items (what host needs guests to bring)
export const contributionItems = sqliteTable("contribution_items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  claimedByGuestId: text("claimed_by_guest_id").references(() => guests.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Cooking Timeline Tasks
export const timelineTasks = sqliteTable("timeline_tasks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  recipeId: text("recipe_id").references(() => recipes.id),
  description: text("description").notNull(),
  scheduledDate: integer("scheduled_date", { mode: "timestamp" }).notNull(),
  scheduledTime: text("scheduled_time"), // e.g., "09:00" or null for anytime
  durationMinutes: integer("duration_minutes"),
  completed: integer("completed", { mode: "boolean" }).default(false),
  sortOrder: integer("sort_order"),
  // Phase-based reminders: only phase-start tasks get reminders
  isPhaseStart: integer("is_phase_start", { mode: "boolean" }).default(false),
  phaseDescription: text("phase_description"), // Friendly reminder message for phase starts
  // Google Calendar sync
  googleCalendarEventId: text("google_calendar_event_id"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Invite Codes (for invite-only access)
export const inviteCodes = sqliteTable("invite_codes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(), // The actual invite code
  maxUses: integer("max_uses").default(1), // How many times it can be used
  usedCount: integer("used_count").default(0), // Current usage count
  createdBy: text("created_by").references(() => users.id), // Admin who created it
  note: text("note"), // Optional label like "For John"
  expiresAt: integer("expires_at", { mode: "timestamp" }), // Optional expiration
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

// Invite Code Uses (audit trail)
export const inviteCodeUses = sqliteTable("invite_code_uses", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  inviteCodeId: text("invite_code_id")
    .notNull()
    .references(() => inviteCodes.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  usedAt: integer("used_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

// Pending Invites (temporary storage for invite codes before OAuth/OTP completes)
export const pendingInvites = sqliteTable("pending_invites", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").unique(), // Nullable - can use phone instead
  phone: text("phone").unique(), // E.164 format: +14155551234
  code: text("code").notNull(),
  inviteCodeId: text("invite_code_id")
    .notNull()
    .references(() => inviteCodes.id),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

// Phone Verification Tokens (for OTP tracking with Twilio)
export const phoneVerificationTokens = sqliteTable("phone_verification_tokens", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  phone: text("phone").notNull(), // E.164 format
  twilioSid: text("twilio_sid").notNull().unique(), // Twilio verification SID
  attempts: integer("attempts").default(0), // Failed verification attempts
  expires: integer("expires", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(
    () => new Date()
  ),
});

// Rate Limits (for OTP rate limiting)
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").notNull(),
  keyType: text("key_type").notNull(), // "phone" or "ip"
  count: integer("count").default(0),
  lockedUntil: integer("locked_until"),
  updatedAt: integer("updated_at").notNull(),
}, () => ({
  // Composite primary key defined in migration
}));

// SMS Opt-Outs (track phone numbers that have opted out of SMS)
export const smsOptOuts = sqliteTable("sms_opt_outs", {
  phone: text("phone").primaryKey().notNull(), // E.164 format
  optedOutAt: integer("opted_out_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  twilioMessageSid: text("twilio_message_sid"), // The SID of the STOP message
});

// Wizard Sessions (for party wizard chat persistence)
// JSON fields store serialized versions of types from wizard-schemas.ts
// Use WizardSessionRow for raw DB data, convert with deserializeWizardSession()
export const wizardSessions = sqliteTable("wizard_sessions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  currentStep: text("current_step", {
    enum: ["party-info", "guests", "menu", "timeline"],
  })
    .notNull()
    .default("party-info"),
  // Tracks the furthest step reached (for enabling forward navigation after going back)
  // 0 = party-info, 1 = guests, 2 = menu, 3 = timeline
  furthestStepIndex: integer("furthest_step_index").notNull().default(0),
  // JSON fields - dates stored as ISO strings, parsed at boundary
  partyInfo: text("party_info", { mode: "json" }).$type<SerializedPartyInfo | null>(),
  guestList: text("guest_list", { mode: "json" })
    .notNull()
    .$type<SerializedGuestData[]>()
    .default([]),
  menuPlan: text("menu_plan", { mode: "json" }).$type<SerializedMenuPlan | null>(),
  timeline: text("timeline", { mode: "json" }).$type<SerializedTimelineTask[] | null>(),
  status: text("status", {
    enum: ["active", "completed", "abandoned"],
  })
    .notNull()
    .default("active"),
  partyId: text("party_id").references(() => parties.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Wizard Messages (chat history for each wizard session/step)
export const wizardMessages = sqliteTable("wizard_messages", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id")
    .notNull()
    .references(() => wizardSessions.id, { onDelete: "cascade" }),
  step: text("step", {
    enum: ["party-info", "guests", "menu", "timeline"],
  }).notNull(),
  message: text("message", { mode: "json" }).notNull().$type<SerializedUIMessage>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Serialized types for JSON storage (dates as ISO strings)
// These mirror the types in wizard-schemas.ts but with string dates
export interface SerializedPartyInfo {
  name: string;
  dateTime: string; // ISO string
  location?: string;
  description?: string;
  allowContributions?: boolean;
}

export interface SerializedGuestData {
  name?: string;
  email?: string;
  phone?: string;
}

export interface SerializedMenuPlan {
  existingRecipes: Array<{
    recipeId: string;
    name: string;
    course?: string;
    scaledServings?: number;
  }>;
  newRecipes: Array<{
    name: string;
    description?: string;
    sourceUrl?: string;
    sourceType?: string;
    imageHash?: string;
    ingredients: Array<{ amount?: string; unit?: string; ingredient: string; notes?: string }>;
    instructions: Array<{ step: number; description: string }>;
    prepTimeMinutes?: number | null;
    cookTimeMinutes?: number | null;
    servings?: number | null;
    tags?: string[];
    dietaryTags?: string[];
    course?: string;
  }>;
  dietaryRestrictions?: string[];
  ambitionLevel?: string;
  processedUrls?: string[];
  processedImageHashes?: string[];
}

export interface SerializedTimelineTask {
  recipeId?: string | null;
  recipeName?: string;
  description: string;
  daysBeforeParty: number;
  scheduledTime: string;
  durationMinutes: number;
  isPhaseStart?: boolean;
  phaseDescription?: string;
}

export interface SerializedUIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  parts: Array<Record<string, unknown>>;
  createdAt?: string;
}

// Scheduled Reminders (for users without calendar sync)
// Each task gets its own reminder, scheduled for X minutes before task start
export const scheduledReminders = sqliteTable("scheduled_reminders", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  taskId: text("task_id")
    .notNull()
    .references(() => timelineTasks.id, { onDelete: "cascade" }),
  // When to send the reminder (e.g., 1 hour before task starts)
  scheduledFor: integer("scheduled_for", { mode: "timestamp" }).notNull(),
  // When the task actually starts (for email content)
  taskStartTime: integer("task_start_time", { mode: "timestamp" }).notNull(),
  sent: integer("sent", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// User Calendar Connections (for Google Calendar sync)
export const calendarConnections = sqliteTable("calendar_connections", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("google"), // For future expansion
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  scope: text("scope"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Type definitions for JSON fields

// Wizard session JSON fields use unknown - actual types are in wizard-schemas.ts
// Serialization helpers convert between DB (string dates) and runtime (Date objects)

// Recipe types
export interface Ingredient {
  amount?: string; // "1", "1/2", "2-3", "" for "to taste"
  unit?: string; // "cup", "tablespoon", "" for countables like "eggs"
  ingredient: string; // "all-purpose flour"
  notes?: string; // "room temperature", "divided"
  section?: string; // "For the sauce", "For the topping"
}

export interface Instruction {
  step: number;
  description: string;
  section?: string; // "For the filling", "Assembly"
}

export type DietaryTag =
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "dairy-free"
  | "nut-free"
  | "contains-alcohol"
  | "contains-eggs"
  | "contains-dairy"
  | "contains-nuts"
  | "contains-shellfish"
  | "contains-fish";

// Infer types from schema
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;

export type Recipe = typeof recipes.$inferSelect;
export type NewRecipe = typeof recipes.$inferInsert;

export type PartyMenuItem = typeof partyMenu.$inferSelect;
export type NewPartyMenuItem = typeof partyMenu.$inferInsert;

export type ContributionItem = typeof contributionItems.$inferSelect;
export type NewContributionItem = typeof contributionItems.$inferInsert;

export type TimelineTask = typeof timelineTasks.$inferSelect;
export type NewTimelineTask = typeof timelineTasks.$inferInsert;

export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type NewCalendarConnection = typeof calendarConnections.$inferInsert;

export type ScheduledReminder = typeof scheduledReminders.$inferSelect;
export type NewScheduledReminder = typeof scheduledReminders.$inferInsert;

export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;

export type InviteCodeUse = typeof inviteCodeUses.$inferSelect;
export type NewInviteCodeUse = typeof inviteCodeUses.$inferInsert;

export type PendingInvite = typeof pendingInvites.$inferSelect;
export type NewPendingInvite = typeof pendingInvites.$inferInsert;

export type PhoneVerificationToken = typeof phoneVerificationTokens.$inferSelect;
export type NewPhoneVerificationToken = typeof phoneVerificationTokens.$inferInsert;

export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;

export type SmsOptOut = typeof smsOptOuts.$inferSelect;
export type NewSmsOptOut = typeof smsOptOuts.$inferInsert;

export type WizardSession = typeof wizardSessions.$inferSelect;
export type NewWizardSession = typeof wizardSessions.$inferInsert;

export type WizardMessage = typeof wizardMessages.$inferSelect;
export type NewWizardMessage = typeof wizardMessages.$inferInsert;
