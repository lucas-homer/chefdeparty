-- Phone Authentication Support Migration

-- Add phone fields to users table
ALTER TABLE `users` ADD COLUMN `phone` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `phone_verified` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);
--> statement-breakpoint

-- Add phone field to guests table
ALTER TABLE `guests` ADD COLUMN `phone` text;
--> statement-breakpoint

-- Create phone verification tokens table for OTP tracking
CREATE TABLE `phone_verification_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `phone` text NOT NULL,
  `twilio_sid` text NOT NULL,
  `attempts` integer DEFAULT 0,
  `expires` integer NOT NULL,
  `created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phone_verification_tokens_twilio_sid_unique` ON `phone_verification_tokens` (`twilio_sid`);
--> statement-breakpoint
CREATE INDEX `phone_verification_tokens_phone_idx` ON `phone_verification_tokens` (`phone`);
--> statement-breakpoint

-- Recreate pending_invites with id as primary key and support for phone
-- SQLite doesn't support ALTER PRIMARY KEY, so we need to create a new table
CREATE TABLE `pending_invites_new` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text,
  `phone` text,
  `code` text NOT NULL,
  `invite_code_id` text NOT NULL REFERENCES invite_codes(id),
  `created_at` integer
);
--> statement-breakpoint
INSERT INTO `pending_invites_new` (`id`, `email`, `code`, `invite_code_id`, `created_at`)
SELECT lower(hex(randomblob(16))), `email`, `code`, `invite_code_id`, `created_at` FROM `pending_invites`;
--> statement-breakpoint
DROP TABLE `pending_invites`;
--> statement-breakpoint
ALTER TABLE `pending_invites_new` RENAME TO `pending_invites`;
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_invites_email_unique` ON `pending_invites` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_invites_phone_unique` ON `pending_invites` (`phone`);
--> statement-breakpoint

-- Create rate limits table for OTP rate limiting
CREATE TABLE `rate_limits` (
  `key` text NOT NULL,
  `key_type` text NOT NULL,
  `count` integer DEFAULT 0,
  `locked_until` integer,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`key`, `key_type`)
);
--> statement-breakpoint
CREATE INDEX `rate_limits_updated_at_idx` ON `rate_limits` (`updated_at`);
