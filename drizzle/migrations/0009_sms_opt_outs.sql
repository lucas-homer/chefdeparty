-- SMS opt-outs table to track phone numbers that have opted out of SMS
CREATE TABLE sms_opt_outs (
  phone TEXT PRIMARY KEY NOT NULL,
  opted_out_at INTEGER NOT NULL DEFAULT (unixepoch()),
  twilio_message_sid TEXT
);

-- Index for quick lookups
CREATE INDEX idx_sms_opt_outs_phone ON sms_opt_outs(phone);
