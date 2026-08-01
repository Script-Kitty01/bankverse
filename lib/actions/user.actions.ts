"use server";

import { ID } from "node-appwrite";
import { createServerClient } from "@/lib/appwrite/config";
import {
  createSessionCookie,
  deleteSessionCookie,
  getLoggedInAccount,
} from "@/lib/appwrite/auth";
import {
  createUserDocument,
  getUserByAccountId,
  updateUserDocument,
} from "@/lib/appwrite/db";
import { redirect } from "next/navigation";

/**
 * Sign up a new user.
 * 1. Create Appwrite account
 * 2. Create user document in database
 * 3. Create session cookie
 */
export const signUp = async (userData: SignUpParams) => {
  const {
    email,
    password,
    firstName,
    lastName,
    address1,
    city,
    state,
    postalCode,
    dateOfBirth,
    ssn,
  } = userData;

  try {
    // 1. Create Appwrite account
    const { account } = createServerClient();
    const newAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`,
    );

    // 2. Create user document in database
    await createUserDocument({
      email,
      userId: newAccount.$id,
      firstName,
      lastName,
      address1,
      city,
      state,
      postalCode,
      dateOfBirth,
      ssn,
    });

    // 3. Create session
    await createSessionCookie(email, password);

    return { success: true } as const;
  } catch (error) {
    console.error("signUp error:", error);
    return {
      success: false,
      error: "Failed to create account. Email may already be in use.",
    };
  }
};

/**
 * Sign in an existing user.
 * 1. Validate credentials via Appwrite
 * 2. Create session cookie
 */
export const signIn = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  try {
    // Create session (validates credentials)
    await createSessionCookie(email, password);

    // Get the account to verify
    const account = await getLoggedInAccount();
    if (!account) {
      return { success: false, error: "Invalid email or password." };
    }

    return { success: true };
  } catch (error) {
    console.error("signIn error:", error);
    return { success: false, error: "Invalid email or password." };
  }
};

/**
 * Sign out the current user.
 */
export const signOut = async () => {
  try {
    await deleteSessionCookie();
  } catch (error) {
    console.error("signOut error:", error);
  }
  redirect("/sign-in");
};

/**
 * Get the currently logged-in user with full profile data.
 * Returns null if not authenticated.
 */
export const getCurrentUser = async (): Promise<User | null> => {
  // Return a demo user when demo mode is enabled
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return {
      $id: "demo-user-001",
      email: "demo@bankverse.com",
      userId: "demo-user-001",
      dwollaCustomerUrl: "",
      dwollaCustomerId: "",
      firstName: "Demo",
      lastName: "User",
      address1: "123 Main Street",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      dateOfBirth: "1990-01-01",
      ssn: "",
    };
  }

  try {
    const account = await getLoggedInAccount();
    if (!account) return null;

    const userDoc = await getUserByAccountId(account.$id);
    if (!userDoc) return null;

    return {
      $id: userDoc.$id,
      email: userDoc.email,
      userId: userDoc.userId,
      dwollaCustomerUrl: userDoc.dwollaCustomerUrl,
      dwollaCustomerId: userDoc.dwollaCustomerId,
      firstName: userDoc.firstName,
      lastName: userDoc.lastName,
      address1: userDoc.address1,
      city: userDoc.city,
      state: userDoc.state,
      postalCode: userDoc.postalCode,
      dateOfBirth: userDoc.dateOfBirth,
      ssn: userDoc.ssn,
    };
  } catch (error) {
    console.error("getCurrentUser error:", error);
    return null;
  }
};

/**
 * Update user profile.
 */
export const updateProfile = async (data: Partial<SignUpParams>) => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Not authenticated." };

    await updateUserDocument(user.$id, data as Record<string, unknown>);
    return { success: true };
  } catch (error) {
    console.error("updateProfile error:", error);
    return { success: false, error: "Failed to update profile." };
  }
};

/**
 * Change password for the current user.
 */
export const changePassword = async (
  currentPassword: string,
  newPassword: string,
) => {
  try {
    const account = await getLoggedInAccount();
    if (!account) return { success: false, error: "Not authenticated." };

    const { account: accountService } = createServerClient();
    await accountService.updatePassword(newPassword, currentPassword);

    return { success: true };
  } catch (error) {
    console.error("changePassword error:", error);
    return {
      success: false,
      error: "Failed to change password. Check your current password.",
    };
  }
};
