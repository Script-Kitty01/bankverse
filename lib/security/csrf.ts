import { cookies } from "next/headers";
import crypto from "crypto";

const CSRF_COOKIE = "csrf-token";
const CSRF_HEADER = "x-csrf-token";

/**
 * Generate a CSRF token and store it in a cookie.
 * Call this in server components or layouts.
 */
export async function generateCsrfToken(): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const cookieStore = await cookies();

  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60, // 1 hour
  });

  return token;
}

/**
 * Get the current CSRF token from cookies.
 */
export async function getCsrfToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const csrfCookie = cookieStore.get(CSRF_COOKIE);
  return csrfCookie?.value ?? null;
}

/**
 * Validate a CSRF token against the stored cookie.
 * @param token - The token from the request header
 */
export async function validateCsrfToken(token: string): Promise<boolean> {
  const storedToken = await getCsrfToken();
  if (!storedToken || !token) return false;

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(storedToken), Buffer.from(token));
  } catch {
    return false;
  }
}

export { CSRF_HEADER };
