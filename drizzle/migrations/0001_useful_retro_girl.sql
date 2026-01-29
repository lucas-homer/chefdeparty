ALTER TABLE `recipes` ADD `copied_from_id` text REFERENCES recipes(id);--> statement-breakpoint
ALTER TABLE `recipes` ADD `share_token` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `tags` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `dietary_tags` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `updated_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `recipes_share_token_unique` ON `recipes` (`share_token`);