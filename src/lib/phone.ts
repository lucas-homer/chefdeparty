import {
  parsePhoneNumber,
  isValidPhoneNumber,
  CountryCode,
} from "libphonenumber-js";

/**
 * Normalize a phone number to E.164 format (+14155551234)
 * @param phone - The phone number input (can be various formats)
 * @param defaultCountry - Default country if not specified (defaults to US)
 * @returns The normalized phone number in E.164 format, or null if invalid
 */
export function normalizePhone(
  phone: string,
  defaultCountry: CountryCode = "US"
): string | null {
  try {
    // Remove any whitespace
    const cleaned = phone.trim();
    if (!cleaned) return null;

    const parsed = parsePhoneNumber(cleaned, defaultCountry);
    if (!parsed || !parsed.isValid()) return null;

    return parsed.format("E.164");
  } catch {
    return null;
  }
}

/**
 * Check if a phone number is valid
 * @param phone - The phone number to validate
 * @param defaultCountry - Default country if not specified (defaults to US)
 * @returns True if the phone number is valid
 */
export function isValidPhone(
  phone: string,
  defaultCountry: CountryCode = "US"
): boolean {
  try {
    const cleaned = phone.trim();
    if (!cleaned) return false;

    return isValidPhoneNumber(cleaned, defaultCountry);
  } catch {
    return false;
  }
}

/**
 * Format a phone number for display (national format)
 * @param phone - The phone number (preferably in E.164 format)
 * @param defaultCountry - Default country if not specified (defaults to US)
 * @returns The formatted phone number for display, or the original input if invalid
 */
export function formatPhoneForDisplay(
  phone: string,
  defaultCountry: CountryCode = "US"
): string {
  try {
    const cleaned = phone.trim();
    if (!cleaned) return phone;

    const parsed = parsePhoneNumber(cleaned, defaultCountry);
    if (!parsed) return phone;

    // Use national format for same-country numbers, international otherwise
    if (parsed.country === defaultCountry) {
      return parsed.formatNational();
    }
    return parsed.formatInternational();
  } catch {
    return phone;
  }
}

/**
 * Get the country code from a phone number
 * @param phone - The phone number (preferably in E.164 format)
 * @param defaultCountry - Default country if not specified (defaults to US)
 * @returns The country code (e.g., "US", "GB") or null if invalid
 */
export function getPhoneCountry(
  phone: string,
  defaultCountry: CountryCode = "US"
): CountryCode | null {
  try {
    const cleaned = phone.trim();
    if (!cleaned) return null;

    const parsed = parsePhoneNumber(cleaned, defaultCountry);
    return parsed?.country || null;
  } catch {
    return null;
  }
}

/**
 * Parse a phone number and return structured data
 * @param phone - The phone number to parse
 * @param defaultCountry - Default country if not specified (defaults to US)
 * @returns Parsed phone data or null if invalid
 */
export function parsePhone(
  phone: string,
  defaultCountry: CountryCode = "US"
): {
  e164: string;
  national: string;
  international: string;
  country: CountryCode;
  countryCallingCode: string;
} | null {
  try {
    const cleaned = phone.trim();
    if (!cleaned) return null;

    const parsed = parsePhoneNumber(cleaned, defaultCountry);
    if (!parsed || !parsed.isValid()) return null;

    return {
      e164: parsed.format("E.164"),
      national: parsed.formatNational(),
      international: parsed.formatInternational(),
      country: parsed.country as CountryCode,
      countryCallingCode: parsed.countryCallingCode,
    };
  } catch {
    return null;
  }
}
