-- Add guest_token column for per-guest invite links
ALTER TABLE guests ADD COLUMN guest_token TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX guests_guest_token_unique ON guests(guest_token);
