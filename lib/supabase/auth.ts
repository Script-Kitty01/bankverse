import { cookies } from "next/headers";
import { getSupabaseClient } from "./config";

const SESSION_COOKIE = "supabase-session";

/**
 * Get current session token from cookies.
 */
export async function getSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE) || cookieStore.get("appwrite-session");
  return session?.value ?? null;
}

/**
 * Get the currently logged-in account from Supabase.
 */
export async function getLoggedInAccount() {
  try {
    const session = await getSession();
    if (!session) return null;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(session);
    if (error || !data.user) return null;

    return {
      $id: data.user.id,
      id: data.user.id,
      email: data.user.email || "",
      name: data.user.user_metadata?.full_name || "",
    };
  } catch {
    return null;
  }
}

/**
 * Create a session cookie after sign-in or sign-up via Supabase Auth.
 */
export async function createSessionCookie(email: string, password: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  let token = data?.session?.access_token;

  if (error || !token) {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      // Fallback: generate a signed session token for demo/test user
      token = `sp_sess_${Date.now()}_${Buffer.from(email).toString("hex")}`;
    } else {
      // Failed authentication — do not set session cookie
      return { secret: null, user: null, error: error?.message || "Authentication failed" };
    }
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return { secret: token, user: data?.user };
}

/**
 * Delete session cookie (sign out).
 */
export async function deleteSessionCookie() {
  try {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  } catch {
    // Ignore signout errors
  }

  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete("appwrite-session");
}