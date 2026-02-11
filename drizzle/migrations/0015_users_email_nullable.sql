-- Make users.email nullable to support phone-only auth users
-- SQLite doesn't support ALTER COLUMN, so recreate the table.
--
-- NOTE: We intentionally do not flip foreign_keys back ON in this migration.
-- Production may contain legacy FK inconsistencies in unrelated tables; turning
-- checks back on inside this migration can fail with SQLITE_CONSTRAINT even
-- after users table recreation.

PRAGMA foreign_keys = OFF;
--> statement-breakpoint

CREATE TABLE `users_new` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text,
  `name` text,
  `image` text,
  `email_verified` integer,
  `created_at` integer,
  `phone` text,
  `phone_verified` integer
);
--> statement-breakpoint

INSERT INTO `users_new` (`id`, `email`, `name`, `image`, `email_verified`, `created_at`, `phone`, `phone_verified`)
SELECT `id`, `email`, `name`, `image`, `email_verified`, `created_at`, `phone`, `phone_verified`
FROM `users`;
--> statement-breakpoint

DROP TABLE `users`;
--> statement-breakpoint

ALTER TABLE `users_new` RENAME TO `users`;
--> statement-breakpoint

CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint

CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);
