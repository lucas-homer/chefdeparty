import { eq, and, gt, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

// Rate limit configuration
export interface RateLimitConfig {
  // Max requests per window
  maxRequests: number;
  // Window size in seconds
  windowSeconds: number;
  // Lockout duration in seconds after hitting limit
  lockoutSeconds: number;
}

// Default configurations
export const OTP_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 5,
  windowSeconds: 3600, // 1 hour
  lockoutSeconds: 3600, // 1 hour lockout
};

export const OTP_IP_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 10,
  windowSeconds: 3600, // 1 hour
  lockoutSeconds: 3600, // 1 hour lockout
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  isLocked: boolean;
}

/**
 * Check rate limit using D1 database
 * Uses a simple sliding window counter approach
 */
export async function checkRateLimit(
  db: DrizzleD1Database,
  key: string,
  keyType: "phone" | "ip",
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - config.windowSeconds * 1000;
  const tableName = "rate_limits";

  // Get current count within window
  const result = await db.run(sql`
    SELECT count, locked_until, updated_at
    FROM ${sql.identifier(tableName)}
    WHERE key = ${key} AND key_type = ${keyType}
  `);

  const row = result.results?.[0] as
    | { count: number; locked_until: number | null; updated_at: number }
    | undefined;

  // Check if locked
  if (row?.locked_until && row.locked_until > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(row.locked_until),
      isLocked: true,
    };
  }

  // If no record or record is outside window, start fresh
  if (!row || row.updated_at < windowStart) {
    await db.run(sql`
      INSERT INTO ${sql.identifier(tableName)} (key, key_type, count, locked_until, updated_at)
      VALUES (${key}, ${keyType}, 1, NULL, ${now})
      ON CONFLICT (key, key_type) DO UPDATE SET
        count = 1,
        locked_until = NULL,
        updated_at = ${now}
    `);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: new Date(now + config.windowSeconds * 1000),
      isLocked: false,
    };
  }

  // Check if within limit
  const newCount = row.count + 1;
  if (newCount > config.maxRequests) {
    // Apply lockout
    const lockedUntil = now + config.lockoutSeconds * 1000;
    await db.run(sql`
      UPDATE ${sql.identifier(tableName)}
      SET locked_until = ${lockedUntil}, updated_at = ${now}
      WHERE key = ${key} AND key_type = ${keyType}
    `);

    return {
      allowed: false,
      remaining: 0,
      resetAt: new Date(lockedUntil),
      isLocked: true,
    };
  }

  // Increment counter
  await db.run(sql`
    UPDATE ${sql.identifier(tableName)}
    SET count = ${newCount}, updated_at = ${now}
    WHERE key = ${key} AND key_type = ${keyType}
  `);

  return {
    allowed: true,
    remaining: config.maxRequests - newCount,
    resetAt: new Date(row.updated_at + config.windowSeconds * 1000),
    isLocked: false,
  };
}

/**
 * Reset rate limit for a key (e.g., after successful verification)
 */
export async function resetRateLimit(
  db: DrizzleD1Database,
  key: string,
  keyType: "phone" | "ip"
): Promise<void> {
  const tableName = "rate_limits";
  await db.run(sql`
    DELETE FROM ${sql.identifier(tableName)}
    WHERE key = ${key} AND key_type = ${keyType}
  `);
}

/**
 * Check if a key is currently locked
 */
export async function isLocked(
  db: DrizzleD1Database,
  key: string,
  keyType: "phone" | "ip"
): Promise<boolean> {
  const now = Date.now();
  const tableName = "rate_limits";

  const result = await db.run(sql`
    SELECT locked_until
    FROM ${sql.identifier(tableName)}
    WHERE key = ${key} AND key_type = ${keyType}
  `);

  const row = result.results?.[0] as { locked_until: number | null } | undefined;
  return row?.locked_until ? row.locked_until > now : false;
}

/**
 * Get client IP from request headers
 * Handles Cloudflare's CF-Connecting-IP header
 */
export function getClientIp(request: Request): string {
  // Cloudflare provides the real IP in CF-Connecting-IP
  const cfIp = request.headers.get("CF-Connecting-IP");
  if (cfIp) return cfIp;

  // Fallback to X-Forwarded-For
  const forwardedFor = request.headers.get("X-Forwarded-For");
  if (forwardedFor) {
    // Take the first IP in the list
    return forwardedFor.split(",")[0].trim();
  }

  // Fallback to X-Real-IP
  const realIp = request.headers.get("X-Real-IP");
  if (realIp) return realIp;

  // Default fallback
  return "unknown";
}

/**
 * Combined rate limit check for OTP requests
 * Checks both phone-based and IP-based limits
 */
export async function checkOtpRateLimit(
  db: DrizzleD1Database,
  phone: string,
  ip: string
): Promise<{
  allowed: boolean;
  error?: string;
  phoneResult?: RateLimitResult;
  ipResult?: RateLimitResult;
}> {
  // Check phone-based limit first
  const phoneResult = await checkRateLimit(db, phone, "phone", OTP_RATE_LIMIT);
  if (!phoneResult.allowed) {
    return {
      allowed: false,
      error: phoneResult.isLocked
        ? "Too many requests. Please try again later."
        : "Rate limit exceeded for this phone number.",
      phoneResult,
    };
  }

  // Check IP-based limit
  const ipResult = await checkRateLimit(db, ip, "ip", OTP_IP_RATE_LIMIT);
  if (!ipResult.allowed) {
    return {
      allowed: false,
      error: ipResult.isLocked
        ? "Too many requests from your location. Please try again later."
        : "Rate limit exceeded.",
      ipResult,
    };
  }

  return {
    allowed: true,
    phoneResult,
    ipResult,
  };
}
