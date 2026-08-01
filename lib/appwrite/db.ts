import { ID, Query } from "node-appwrite";
import { createServerClient, DATABASE_ID, USERS_COLLECTION_ID, BANKS_COLLECTION_ID, TRANSACTIONS_COLLECTION_ID } from "./config";

/**
 * Create a user document in the Appwrite database.
 */
export async function createUserDocument(user: {
  email: string;
  userId: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  dateOfBirth: string;
  ssn: string;
}) {
  const { databases } = createServerClient();

  const doc = await databases.createDocument(
    DATABASE_ID,
    USERS_COLLECTION_ID,
    ID.unique(),
    {
      ...user,
      dwollaCustomerUrl: "",
      dwollaCustomerId: "",
    }
  );

  return doc;
}

/**
 * Get a user document by their Appwrite account ID (userId).
 */
export async function getUserByAccountId(userId: string) {
  const { databases } = createServerClient();

  const result = await databases.listDocuments(DATABASE_ID, USERS_COLLECTION_ID, [
    Query.equal("userId", userId),
    Query.limit(1),
  ]);

  return result.documents[0] ?? null;
}

/**
 * Get a user document by email.
 */
export async function getUserByEmail(email: string) {
  const { databases } = createServerClient();

  const result = await databases.listDocuments(DATABASE_ID, USERS_COLLECTION_ID, [
    Query.equal("email", email),
    Query.limit(1),
  ]);

  return result.documents[0] ?? null;
}

/**
 * Update a user document.
 */
export async function updateUserDocument(documentId: string, data: Record<string, unknown>) {
  const { databases } = createServerClient();

  return await databases.updateDocument(DATABASE_ID, USERS_COLLECTION_ID, documentId, data);
}

/**
 * Create a bank document (linked Plaid account).
 */
export async function createBankDocument(bank: {
  userId: string;
  accountId: string;
  bankId: string;
  accessToken: string;
  fundingSourceUrl: string;
  sharableId: string;
}) {
  const { databases } = createServerClient();

  return await databases.createDocument(DATABASE_ID, BANKS_COLLECTION_ID, ID.unique(), bank);
}

/**
 * Get all banks for a user.
 */
export async function getBanksByUserId(userId: string) {
  // Return mock banks in demo mode
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return [
      {
        $id: "demo-bank-001",
        userId,
        accountId: "demo-acc-001",
        bankId: "ins_1",
        accessToken: "demo-token",
        fundingSourceUrl: "",
        sharableId: "demo-share-001",
      },
      {
        $id: "demo-bank-002",
        userId,
        accountId: "demo-acc-002",
        bankId: "ins_2",
        accessToken: "demo-token-2",
        fundingSourceUrl: "",
        sharableId: "demo-share-002",
      },
    ];
  }

  const { databases } = createServerClient();

  const result = await databases.listDocuments(DATABASE_ID, BANKS_COLLECTION_ID, [
    Query.equal("userId", userId),
  ]);

  return result.documents;
}

/**
 * Get a single bank by its document ID.
 */
export async function getBankByDocumentId(documentId: string) {
  const { databases } = createServerClient();

  return await databases.getDocument(DATABASE_ID, BANKS_COLLECTION_ID, documentId);
}

/**
 * Delete a bank document.
 */
export async function deleteBankDocument(documentId: string) {
  const { databases } = createServerClient();

  return await databases.deleteDocument(DATABASE_ID, BANKS_COLLECTION_ID, documentId);
}

/**
 * Create a transaction document.
 */
export async function createTransactionDocument(transaction: {
  accountId: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  paymentChannel: string;
  type: string;
  pending: boolean;
  senderBankId: string;
  receiverBankId: string;
}) {
  const { databases } = createServerClient();

  return await databases.createDocument(
    DATABASE_ID,
    TRANSACTIONS_COLLECTION_ID,
    ID.unique(),
    transaction
  );
}

/**
 * Get paginated transactions for an account.
 */
export async function getTransactionsByAccountId(
  accountId: string,
  limit = 10,
  offset = 0
) {
  const { databases } = createServerClient();

  const result = await databases.listDocuments(
    DATABASE_ID,
    TRANSACTIONS_COLLECTION_ID,
    [
      Query.equal("accountId", accountId),
      Query.orderDesc("$createdAt"),
      Query.limit(limit),
      Query.offset(offset),
    ]
  );

  return result;
}

/**
 * Get all transactions for a user across all their accounts.
 */
export async function getTransactionsByUserId(
  accountIds: string[],
  limit = 10,
  offset = 0
) {
  // Return mock transactions in demo mode
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const mockTransactions = [
      { id: "tx-001", $id: "tx-001", accountId: "demo-acc-001", name: "Starbucks Coffee", amount: -12.50, category: "Food and Drink", date: "2026-07-31", paymentChannel: "in store", type: "debit", pending: false, senderBankId: "demo-bank-001", receiverBankId: "" },
      { id: "tx-002", $id: "tx-002", accountId: "demo-acc-001", name: "Amazon.com", amount: -89.99, category: "Payment", date: "2026-07-30", paymentChannel: "online", type: "debit", pending: false, senderBankId: "demo-bank-001", receiverBankId: "" },
      { id: "tx-003", $id: "tx-003", accountId: "demo-acc-001", name: "Salary Deposit", amount: 4500.00, category: "Transfer", date: "2026-07-28", paymentChannel: "online", type: "credit", pending: false, senderBankId: "", receiverBankId: "demo-bank-001" },
      { id: "tx-004", $id: "tx-004", accountId: "demo-acc-001", name: "Netflix Subscription", amount: -15.99, category: "Payment", date: "2026-07-27", paymentChannel: "online", type: "debit", pending: false, senderBankId: "demo-bank-001", receiverBankId: "" },
      { id: "tx-005", $id: "tx-005", accountId: "demo-acc-001", name: "Uber Ride", amount: -24.30, category: "Payment", date: "2026-07-26", paymentChannel: "online", type: "debit", pending: false, senderBankId: "demo-bank-001", receiverBankId: "" },
      { id: "tx-006", $id: "tx-006", accountId: "demo-acc-002", name: "Freelance Payment", amount: 1200.00, category: "Transfer", date: "2026-07-25", paymentChannel: "online", type: "credit", pending: false, senderBankId: "", receiverBankId: "demo-bank-002" },
      { id: "tx-007", $id: "tx-007", accountId: "demo-acc-002", name: "Whole Foods", amount: -67.45, category: "Food and Drink", date: "2026-07-24", paymentChannel: "in store", type: "debit", pending: false, senderBankId: "demo-bank-002", receiverBankId: "" },
      { id: "tx-008", $id: "tx-008", accountId: "demo-acc-001", name: "Spotify Premium", amount: -9.99, category: "Payment", date: "2026-07-23", paymentChannel: "online", type: "debit", pending: true, senderBankId: "demo-bank-001", receiverBankId: "" },
      { id: "tx-009", $id: "tx-009", accountId: "demo-acc-002", name: "Gas Station", amount: -45.00, category: "Payment", date: "2026-07-22", paymentChannel: "in store", type: "debit", pending: false, senderBankId: "demo-bank-002", receiverBankId: "" },
      { id: "tx-010", $id: "tx-010", accountId: "demo-acc-001", name: "Apple Store", amount: -299.99, category: "Payment", date: "2026-07-21", paymentChannel: "online", type: "debit", pending: false, senderBankId: "demo-bank-001", receiverBankId: "" },
      { id: "tx-011", $id: "tx-011", accountId: "demo-acc-002", name: "Interest Payment", amount: 3.42, category: "Transfer", date: "2026-07-20", paymentChannel: "online", type: "credit", pending: false, senderBankId: "", receiverBankId: "demo-bank-002" },
      { id: "tx-012", $id: "tx-012", accountId: "demo-acc-001", name: "DoorDash Order", amount: -34.50, category: "Food and Drink", date: "2026-07-19", paymentChannel: "online", type: "debit", pending: false, senderBankId: "demo-bank-001", receiverBankId: "" },
    ];

    const filtered = mockTransactions.filter((tx) => accountIds.includes(tx.accountId));
    const total = filtered.length;
    const paged = filtered.slice(offset, offset + limit);

    return { documents: paged, total };
  }

  if (accountIds.length === 0) return { documents: [], total: 0 };

  const { databases } = createServerClient();

  const queries = accountIds.map((id) => Query.equal("accountId", id));

  const result = await databases.listDocuments(
    DATABASE_ID,
    TRANSACTIONS_COLLECTION_ID,
    [
      ...queries,
      Query.orderDesc("$createdAt"),
      Query.limit(limit),
      Query.offset(offset),
    ]
  );

  return result;
}
