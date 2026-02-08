-- No-op: completed_steps column was never added (furthest_step_index was added directly in 0012)
-- This migration originally tried to drop completed_steps but that column doesn't exist.
SELECT 1;
