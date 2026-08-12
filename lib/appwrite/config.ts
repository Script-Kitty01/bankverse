import { Client, Account, Databases, Storage } from "node-appwrite";

/**
 * Creates an Appwrite server client (used in server actions & API routes).
 * Uses APPWRITE_API_KEY for server-side operations.
 */
export function createServerClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

  return {
    get account() {
      return new Account(client);
    },
    get databases() {
      return new Databases(client);
    },
    get storage() {
      return new Storage(client);
    },
  };
}

/**
 * Creates an Appwrite client for session-based operations.
 * Used in middleware and server components that read session cookies.
 */
export function createSessionClient(session: string) {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setSession(session);

  return {
    get account() {
      return new Account(client);
    },
    get databases() {
      return new Databases(client);
    },
  };
}

// Database & Collection IDs (set these in .env.local)
export const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!;
export const USERS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_USERS_COLLECTION_ID!;
export const BANKS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_BANKS_COLLECTION_ID!;
export const TRANSACTIONS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_TRANSACTIONS_COLLECTION_ID!;

// BankVerse — Payment Reliability Collections
export const LEDGER_ACCOUNTS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_LEDGER_ACCOUNTS_COLLECTION_ID ||
  "ledger_accounts";
export const LEDGER_ENTRIES_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_LEDGER_ENTRIES_COLLECTION_ID ||
  "ledger_entries";
export const PAYMENT_TRANSACTIONS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PAYMENT_TRANSACTIONS_COLLECTION_ID ||
  "payment_transactions";
export const RECONCILIATION_RUNS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_RECONCILIATION_RUNS_COLLECTION_ID ||
  "reconciliation_runs";
export const RECONCILIATION_ITEMS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_RECONCILIATION_ITEMS_COLLECTION_ID ||
  "reconciliation_items";
export const INCIDENTS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_INCIDENTS_COLLECTION_ID || "incidents";
