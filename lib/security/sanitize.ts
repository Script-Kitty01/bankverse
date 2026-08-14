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
  if (Array.isArray(obj)) {
    return obj.map((item) =>
      typeof item === "string"
        ? sanitizeString(item)
        : typeof item === "object" && item !== null
        ? sanitizeObject(item as Record<string, unknown>)
        : item,
    ) as unknown as T;
  }

  const sanitized = { ...obj };
  for (const key in sanitized) {
    const val = sanitized[key];
    if (typeof val === "string") {
      (sanitized as Record<string, unknown>)[key] = sanitizeString(val);
    } else if (Array.isArray(val)) {
      (sanitized as Record<string, unknown>)[key] = val.map((item) =>
        typeof item === "string"
          ? sanitizeString(item)
          : typeof item === "object" && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : item,
      );
    } else if (
      typeof val === "object" &&
      val !== null &&
      val.constructor === Object
    ) {
      (sanitized as Record<string, unknown>)[key] = sanitizeObject(
        val as Record<string, unknown>,
      );
    }
  }
  return sanitized;
}
