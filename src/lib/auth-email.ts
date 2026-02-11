const PHONE_AUTH_PLACEHOLDER_DOMAIN = "phone-auth.invalid";

/**
 * Builds a deterministic placeholder email for phone-only users.
 * This is used as a compatibility fallback for databases that still
 * enforce NOT NULL on users.email.
 */
export function createPhoneAuthPlaceholderEmail(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");
  return `phone-${digitsOnly}@${PHONE_AUTH_PLACEHOLDER_DOMAIN}`;
}

/**
 * Checks whether an email is an internal placeholder for phone-only auth.
 */
export function isPhoneAuthPlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.endsWith(`@${PHONE_AUTH_PLACEHOLDER_DOMAIN}`);
}

/**
 * Converts internal placeholder emails to null for display/session usage.
 */
export function sanitizeAuthEmail(email: string | null | undefined): string | null {
  if (!email || isPhoneAuthPlaceholderEmail(email)) return null;
  return email;
}
