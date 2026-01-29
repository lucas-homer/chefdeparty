-- Drop and recreate scheduled_reminders with task-based structure
DROP TABLE IF EXISTS `scheduled_reminders`;

CREATE TABLE `scheduled_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`party_id` text NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text NOT NULL,
	`scheduled_for` integer NOT NULL,
	`task_start_time` integer NOT NULL,
	`sent` integer DEFAULT false,
	`created_at` integer,
	FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `timeline_tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
