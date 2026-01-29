-- Invite codes for invite-only access
CREATE TABLE `invite_codes` (
  `id` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `max_uses` integer DEFAULT 1,
  `used_count` integer DEFAULT 0,
  `created_by` text REFERENCES users(id),
  `note` text,
  `expires_at` integer,
  `created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codes_code_unique` ON `invite_codes` (`code`);
--> statement-breakpoint

-- Invite code usage audit trail
CREATE TABLE `invite_code_uses` (
  `id` text PRIMARY KEY NOT NULL,
  `invite_code_id` text NOT NULL REFERENCES invite_codes(id),
  `user_id` text NOT NULL REFERENCES users(id),
  `used_at` integer
);
--> statement-breakpoint

-- Pending invites for tracking invite codes during OAuth flow
CREATE TABLE `pending_invites` (
  `email` text PRIMARY KEY NOT NULL,
  `code` text NOT NULL,
  `invite_code_id` text NOT NULL REFERENCES invite_codes(id),
  `created_at` integer
);
