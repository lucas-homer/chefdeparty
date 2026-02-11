-- Intentionally no-op.
--
-- Attempting to rebuild `users` to make `email` nullable fails on D1 production
-- with `FOREIGN KEY constraint failed` because many tables reference `users`.
-- Runtime compatibility is handled in phone auth by falling back to a
-- deterministic placeholder email when `users.email` is NOT NULL.
--
-- Keep this migration so deployment can advance safely; revisit schema-level
-- nullability in a dedicated migration plan that preserves FK integrity.
SELECT 1;
