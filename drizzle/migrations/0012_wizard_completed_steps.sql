-- Add furthest_step_index column to wizard_sessions for tracking the highest step reached
-- This enables proper step navigation (going back and forward through reached steps)
-- 0 = party-info, 1 = guests, 2 = menu, 3 = timeline
ALTER TABLE `wizard_sessions` ADD COLUMN `furthest_step_index` integer NOT NULL DEFAULT 0;
