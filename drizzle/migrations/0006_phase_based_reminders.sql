-- Add phase-based reminder fields to timeline_tasks
ALTER TABLE `timeline_tasks` ADD COLUMN `is_phase_start` integer DEFAULT false;
ALTER TABLE `timeline_tasks` ADD COLUMN `phase_description` text;
