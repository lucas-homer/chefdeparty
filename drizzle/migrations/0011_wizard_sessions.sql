-- Party Wizard Sessions table for persisting wizard chat state
CREATE TABLE `wizard_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  `current_step` text NOT NULL DEFAULT 'party-info',
  `party_info` text,
  `guest_list` text NOT NULL DEFAULT '[]',
  `menu_plan` text,
  `timeline` text,
  `status` text NOT NULL DEFAULT 'active',
  `party_id` text REFERENCES parties(id) ON DELETE SET NULL,
  `created_at` integer,
  `updated_at` integer
);
--> statement-breakpoint

-- Party Wizard Messages table for persisting chat history per step
CREATE TABLE `wizard_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `session_id` text NOT NULL REFERENCES wizard_sessions(id) ON DELETE CASCADE,
  `step` text NOT NULL,
  `message` text NOT NULL,
  `created_at` integer
);
--> statement-breakpoint

-- Index for looking up active sessions by user
CREATE INDEX `wizard_sessions_user_status_idx` ON `wizard_sessions` (`user_id`, `status`);
--> statement-breakpoint

-- Index for looking up messages by session and step
CREATE INDEX `wizard_messages_session_step_idx` ON `wizard_messages` (`session_id`, `step`);
