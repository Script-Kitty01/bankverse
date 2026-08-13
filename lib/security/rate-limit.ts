/**
 * Simple in-memory rate limiter for server actions.
 * In production, use Redis or a database-backed solution.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);

if (cleanupInterval && typeof cleanupInterval.unref === "function") {
  cleanupInterval.unref();
}

/**
 * Check if a key has exceeded the rate limit.
 * @param key - Unique identifier (e.g., IP address or user ID)
 * @param maxAttempts - Maximum allowed attempts
 * @param windowMs - Time window in milliseconds
 * @returns Object with `allowed` boolean and `remaining` attempts
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: maxAttempts - 1,
      resetAt: now + windowMs,
    };
  }

  entry.count++;

  if (entry.count > maxAttempts) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Rate limit for sign-in attempts: 5 attempts per 15 minutes per IP.
 */
export function signInRateLimit(identifier: string) {
  return checkRateLimit(`signin:${identifier}`, 5, 15 * 60 * 1000);
}

/**
 * Rate limit for sign-up attempts: 3 attempts per hour per IP.
 */
export function signUpRateLimit(identifier: string) {
  return checkRateLimit(`signup:${identifier}`, 3, 60 * 60 * 1000);
}

/**
 * Rate limit for transfer attempts: 10 per minute per user.
 */
export function transferRateLimit(userId: string) {
  return checkRateLimit(`transfer:${userId}`, 10, 60 * 1000);
}
