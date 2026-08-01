import { cookies } from "next/headers";
import { createSessionClient } from "./config";

const SESSION_COOKIE = "appwrite-session";

/**
 * Get the current session from cookies.
 */
export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE);
  return session?.value ?? null;
}

/**
 * Get the currently logged-in Appwrite account.
 * Returns null if no valid session exists.
 */
export async function getLoggedInAccount() {
  try {
    const session = await getSession();
    if (!session) return null;

    const { account } = createSessionClient(session);
    return await account.get();
  } catch {
    return null;
  }
}

/**
 * Create a session cookie after successful sign-in.
 */
export async function createSessionCookie(email: string, password: string) {
  const { account } = createSessionClient("temp");
  const session = await account.createEmailPasswordSession(email, password);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return session;
}

/**
 * Delete the session cookie (sign out).
 */
export async function deleteSessionCookie() {
  try {
    const session = await getSession();
    if (session) {
      const { account } = createSessionClient(session);
      await account.deleteSession("current");
    }
  } catch {
    // Session may already be expired
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
