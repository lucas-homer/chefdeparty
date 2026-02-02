-- Replace completed_steps (JSON array) with furthest_step_index (integer)
-- The integer approach is simpler and more efficient for tracking navigation state
-- 0 = party-info, 1 = guests, 2 = menu, 3 = timeline

-- Add the new column
ALTER TABLE `wizard_sessions` ADD COLUMN `furthest_step_index` integer NOT NULL DEFAULT 0;

-- Drop the old column (SQLite doesn't support DROP COLUMN in older versions,
-- but D1 uses a modern SQLite that does support it)
ALTER TABLE `wizard_sessions` DROP COLUMN `completed_steps`;
