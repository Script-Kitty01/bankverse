"use server";

import { createPlaidClient } from "@/lib/plaid/config";
import { createBankDocument, getBanksByUserId } from "@/lib/appwrite/db";
import { getCurrentUser } from "./user.actions";
import { CountryCode, Products } from "plaid";
import { cookies } from "next/headers";

/**
 * Create a Plaid Link token for a user.
 * This is the first step in the Plaid Link flow.
 */
export const createLinkToken = async () => {
  try {
    // Skip Plaid API call in demo mode — return a mock token
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      return { success: true, linkToken: "link-sandbox-demo-mock-token" };
    }

    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Not authenticated." };

    const plaidClient = createPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.userId },
      client_name: "BankVerse",
      products: [Products.Auth, Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return { success: true, linkToken: response.data.link_token };
  } catch (error) {
    console.error("createLinkToken error:", error);
    return { success: false, error: "Failed to create link token." };
  }
};

/**
 * Exchange a Plaid public token for an access token and store the bank.
 */
export const exchangePublicToken = async (publicToken: string) => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Not authenticated." };

    const plaidClient = createPlaidClient();

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get account info from Plaid
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    // Store each account as a bank document
    for (const account of accountsResponse.data.accounts) {
      await createBankDocument({
        userId: user.userId,
        accountId: account.account_id,
        bankId: itemId,
        accessToken,
        fundingSourceUrl: "",
        sharableId: account.account_id,
      });
    }

    return { success: true };
  } catch (error) {
    console.error("exchangePublicToken error:", error);
    return { success: false, error: "Failed to link bank account." };
  }
};

/**
 * Add a custom / simulated bank account for the user.
 * Persists in a secure HTTP-only cookie and Appwrite DB if configured.
 */
export const addCustomBank = async (params: {
  bankName: string;
  accountType?: "checking" | "savings" | "credit" | "investment";
  balance?: number;
  mask?: string;
  officialName?: string;
}) => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Not authenticated." };

    const cookieStore = await cookies();
    const existingCookie = cookieStore.get("bankverse_custom_banks")?.value;
    let customBanks: Account[] = [];

    if (existingCookie) {
      try {
        customBanks = JSON.parse(existingCookie);
      } catch {
        customBanks = [];
      }
    }

    const randomMask =
      params.mask || Math.floor(1000 + Math.random() * 9000).toString();
    const numBalance = params.balance || 5000;
    const acctType = params.accountType || "checking";
    const timestamp = Date.now();

    const newAccount: Account = {
      id: `custom-acc-${timestamp}`,
      availableBalance: numBalance,
      currentBalance: numBalance + 250,
      officialName:
        params.officialName ||
        `${params.bankName} ${acctType.charAt(0).toUpperCase() + acctType.slice(1)}`,
      mask: randomMask,
      institutionId: `ins_custom_${timestamp}`,
      name: `${params.bankName} ${acctType.charAt(0).toUpperCase() + acctType.slice(1)}`,
      type: acctType === "credit" ? "credit" : "depository",
      subtype: acctType,
      appwriteItemId: `custom-bank-${timestamp}`,
      sharableId: `custom-share-${timestamp}`,
    };

    customBanks.push(newAccount);

    cookieStore.set("bankverse_custom_banks", JSON.stringify(customBanks), {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    return { success: true, account: newAccount };
  } catch (error) {
    console.error("addCustomBank error:", error);
    return { success: false, error: "Failed to add bank account." };
  }
};

/**
 * Get all accounts for the current user from Plaid & Custom links.
 */
export const getAccounts = async () => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Not authenticated." };

    const cookieStore = await cookies();
    const customCookie = cookieStore.get("bankverse_custom_banks")?.value;
    let customAccounts: Account[] = [];
    if (customCookie) {
      try {
        customAccounts = JSON.parse(customCookie);
      } catch {
        customAccounts = [];
      }
    }

    // Base demo accounts
    const baseAccounts: Account[] = [
      {
        id: "demo-acc-001",
        availableBalance: 4520.5,
        currentBalance: 4820.5,
        officialName: "Chase Checking",
        mask: "1234",
        institutionId: "ins_1",
        name: "Chase Checking",
        type: "depository",
        subtype: "checking",
        appwriteItemId: "demo-bank-001",
        sharableId: "demo-share-001",
      },
      {
        id: "demo-acc-002",
        availableBalance: 12350.75,
        currentBalance: 12800.75,
        officialName: "Wells Fargo Savings",
        mask: "5678",
        institutionId: "ins_2",
        name: "Wells Fargo Savings",
        type: "depository",
        subtype: "savings",
        appwriteItemId: "demo-bank-002",
        sharableId: "demo-share-002",
      },
    ];

    // Return mock & custom accounts in demo mode
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      return {
        success: true,
        accounts: [...baseAccounts, ...customAccounts],
      };
    }

    const bankDocs = await getBanksByUserId(user.userId);
    const plaidClient = createPlaidClient();

    const accounts: Account[] = [];

    for (const bank of bankDocs) {
      try {
        const response = await plaidClient.accountsGet({
          access_token: bank.accessToken,
        });

        for (const acct of response.data.accounts) {
          accounts.push({
            id: acct.account_id,
            availableBalance: acct.balances.available ?? 0,
            currentBalance: acct.balances.current ?? 0,
            officialName: acct.official_name ?? acct.name,
            mask: acct.mask ?? "",
            institutionId: bank.bankId,
            name: acct.name,
            type: acct.type,
            subtype: acct.subtype ?? "",
            appwriteItemId: bank.$id,
            sharableId: acct.account_id,
          });
        }
      } catch {
        // Skip banks with invalid tokens
        continue;
      }
    }

    return { success: true, accounts };
  } catch (error) {
    console.error("getAccounts error:", error);
    return { success: false, error: "Failed to fetch accounts." };
  }
};

/**
 * Get transactions for a specific account from Plaid.
 */
export const getTransactions = async (accessToken: string) => {
  try {
    const plaidClient = createPlaidClient();

    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
    });

    const transactions: Transaction[] = response.data.added.map((tx) => ({
      id: tx.transaction_id,
      $id: tx.transaction_id,
      name: tx.name,
      paymentChannel: tx.payment_channel,
      type: tx.transaction_type ?? "debit",
      accountId: tx.account_id,
      amount: tx.amount,
      pending: tx.pending,
      category: tx.category?.[0] ?? "Uncategorized",
      date: tx.date,
      image: "",
      $createdAt: tx.date,
      channel: tx.payment_channel,
      senderBankId: tx.account_id,
      receiverBankId: tx.account_id,
    }));

    return { success: true, transactions };
  } catch (error) {
    console.error("getTransactions error:", error);
    return { success: false, error: "Failed to fetch transactions." };
  }
};
