/**
 * Input sanitization utilities.
 * All user inputs should be sanitized before storage or display.
 */

/**
 * Sanitize a string by removing HTML tags and trimming.
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/[<>]/g, "") // Remove angle brackets
    .trim();
}

/**
 * Sanitize an email address.
 */
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Sanitize a name (letters, spaces, hyphens, apostrophes only).
 */
export function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z\s\-']/g, "").trim();
}

/**
 * Sanitize an object's string values recursively.
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const sanitized = { ...obj };
  for (const key in sanitized) {
    if (typeof sanitized[key] === "string") {
      (sanitized as Record<string, unknown>)[key] = sanitizeString(
        sanitized[key] as string,
      );
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      (sanitized as Record<string, unknown>)[key] = sanitizeObject(
        sanitized[key] as Record<string, unknown>,
      );
    }
  }
  return sanitized;
}
