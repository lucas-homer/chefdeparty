-- Make guests.email nullable to support phone-only guests
-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table

-- Disable foreign key checks
PRAGMA foreign_keys = OFF;
--> statement-breakpoint

-- Create new table with nullable email
CREATE TABLE `guests_new` (
  `id` text PRIMARY KEY NOT NULL,
  `party_id` text NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  `user_id` text REFERENCES users(id),
  `email` text,
  `phone` text,
  `name` text,
  `rsvp_status` text DEFAULT 'pending',
  `headcount` integer DEFAULT 1,
  `dietary_restrictions` text,
  `created_at` integer
);
--> statement-breakpoint

-- Copy data from old table
INSERT INTO `guests_new` (`id`, `party_id`, `user_id`, `email`, `phone`, `name`, `rsvp_status`, `headcount`, `dietary_restrictions`, `created_at`)
SELECT `id`, `party_id`, `user_id`, `email`, `phone`, `name`, `rsvp_status`, `headcount`, `dietary_restrictions`, `created_at`
FROM `guests`;
--> statement-breakpoint

-- Drop old table
DROP TABLE `guests`;
--> statement-breakpoint

-- Rename new table
ALTER TABLE `guests_new` RENAME TO `guests`;
--> statement-breakpoint

-- Re-enable foreign key checks
PRAGMA foreign_keys = ON;
