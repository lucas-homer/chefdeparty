CREATE TABLE `scheduled_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`party_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reminder_type` text NOT NULL,
	`scheduled_for` integer NOT NULL,
	`task_ids` text NOT NULL,
	`sent` integer DEFAULT false,
	`created_at` integer,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
