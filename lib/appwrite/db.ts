import { ID, Query } from "node-appwrite";
import {
  createServerClient,
  DATABASE_ID,
  USERS_COLLECTION_ID,
  BANKS_COLLECTION_ID,
  TRANSACTIONS_COLLECTION_ID,
} from "./config";

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
    },
  );

  return doc;
}

/**
 * Get a user document by their Appwrite account ID (userId).
 */
export async function getUserByAccountId(userId: string) {
  const { databases } = createServerClient();

  const result = await databases.listDocuments(
    DATABASE_ID,
    USERS_COLLECTION_ID,
    [Query.equal("userId", userId), Query.limit(1)],
  );

  return result.documents[0] ?? null;
}

/**
 * Get a user document by email.
 */
export async function getUserByEmail(email: string) {
  const { databases } = createServerClient();

  const result = await databases.listDocuments(
    DATABASE_ID,
    USERS_COLLECTION_ID,
    [Query.equal("email", email), Query.limit(1)],
  );

  return result.documents[0] ?? null;
}

/**
 * Update a user document.
 */
export async function updateUserDocument(
  documentId: string,
  data: Record<string, unknown>,
) {
  const { databases } = createServerClient();

  return await databases.updateDocument(
    DATABASE_ID,
    USERS_COLLECTION_ID,
    documentId,
    data,
  );
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

  return await databases.createDocument(
    DATABASE_ID,
    BANKS_COLLECTION_ID,
    ID.unique(),
    bank,
  );
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

  const result = await databases.listDocuments(
    DATABASE_ID,
    BANKS_COLLECTION_ID,
    [Query.equal("userId", userId)],
  );

  return result.documents;
}

/**
 * Get a single bank by its document ID.
 */
export async function getBankByDocumentId(documentId: string) {
  const { databases } = createServerClient();

  return await databases.getDocument(
    DATABASE_ID,
    BANKS_COLLECTION_ID,
    documentId,
  );
}

/**
 * Delete a bank document.
 */
export async function deleteBankDocument(documentId: string) {
  const { databases } = createServerClient();

  return await databases.deleteDocument(
    DATABASE_ID,
    BANKS_COLLECTION_ID,
    documentId,
  );
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
    transaction,
  );
}

/**
 * Get paginated transactions for an account.
 */
export async function getTransactionsByAccountId(
  accountId: string,
  limit = 10,
  offset = 0,
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
    ],
  );

  return result;
}

/**
 * Get all transactions for a user across all their accounts.
 */
export async function getTransactionsByUserId(
  accountIds: string[],
  limit = 10,
  offset = 0,
) {
  // Return mock transactions in demo mode
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const mockTransactions = [
      {
        id: "tx-001",
        $id: "tx-001",
        accountId: "demo-acc-001",
        name: "Starbucks Coffee",
        amount: -12.5,
        category: "Food and Drink",
        date: "2026-07-31",
        paymentChannel: "in store",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-002",
        $id: "tx-002",
        accountId: "demo-acc-001",
        name: "Amazon.com",
        amount: -89.99,
        category: "Payment",
        date: "2026-07-30",
        paymentChannel: "online",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-003",
        $id: "tx-003",
        accountId: "demo-acc-001",
        name: "Salary Deposit",
        amount: 4500.0,
        category: "Transfer",
        date: "2026-07-28",
        paymentChannel: "online",
        type: "credit",
        pending: false,
        senderBankId: "",
        receiverBankId: "demo-bank-001",
      },
      {
        id: "tx-004",
        $id: "tx-004",
        accountId: "demo-acc-001",
        name: "Netflix Subscription",
        amount: -15.99,
        category: "Payment",
        date: "2026-07-27",
        paymentChannel: "online",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-005",
        $id: "tx-005",
        accountId: "demo-acc-001",
        name: "Uber Ride",
        amount: -24.3,
        category: "Payment",
        date: "2026-07-26",
        paymentChannel: "online",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-006",
        $id: "tx-006",
        accountId: "demo-acc-002",
        name: "Freelance Payment",
        amount: 1200.0,
        category: "Transfer",
        date: "2026-07-25",
        paymentChannel: "online",
        type: "credit",
        pending: false,
        senderBankId: "",
        receiverBankId: "demo-bank-002",
      },
      {
        id: "tx-007",
        $id: "tx-007",
        accountId: "demo-acc-002",
        name: "Whole Foods",
        amount: -67.45,
        category: "Food and Drink",
        date: "2026-07-24",
        paymentChannel: "in store",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-002",
        receiverBankId: "",
      },
      {
        id: "tx-008",
        $id: "tx-008",
        accountId: "demo-acc-001",
        name: "Spotify Premium",
        amount: -9.99,
        category: "Payment",
        date: "2026-07-23",
        paymentChannel: "online",
        type: "debit",
        pending: true,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-009",
        $id: "tx-009",
        accountId: "demo-acc-002",
        name: "Gas Station",
        amount: -45.0,
        category: "Payment",
        date: "2026-07-22",
        paymentChannel: "in store",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-002",
        receiverBankId: "",
      },
      {
        id: "tx-010",
        $id: "tx-010",
        accountId: "demo-acc-001",
        name: "Apple Store",
        amount: -299.99,
        category: "Payment",
        date: "2026-07-21",
        paymentChannel: "online",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-011",
        $id: "tx-011",
        accountId: "demo-acc-002",
        name: "Interest Payment",
        amount: 3.42,
        category: "Transfer",
        date: "2026-07-20",
        paymentChannel: "online",
        type: "credit",
        pending: false,
        senderBankId: "",
        receiverBankId: "demo-bank-002",
      },
      {
        id: "tx-012",
        $id: "tx-012",
        accountId: "demo-acc-001",
        name: "DoorDash Order",
        amount: -34.5,
        category: "Food and Drink",
        date: "2026-07-19",
        paymentChannel: "online",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-013",
        $id: "tx-013",
        accountId: "demo-acc-001",
        name: "UPI Transfer to Savings",
        amount: -2500,
        category: "Transfer",
        date: "2026-07-18",
        paymentChannel: "UPI",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-014",
        $id: "tx-014",
        accountId: "demo-acc-001",
        name: "Credit Card Bill",
        amount: -500,
        category: "Payment",
        date: "2026-07-17",
        paymentChannel: "Card",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-001",
        receiverBankId: "",
      },
      {
        id: "tx-015",
        $id: "tx-015",
        accountId: "demo-acc-002",
        name: "Rent Payment via Netbanking",
        amount: -10000,
        category: "Payment",
        date: "2026-07-16",
        paymentChannel: "Netbanking",
        type: "debit",
        pending: false,
        senderBankId: "demo-bank-002",
        receiverBankId: "",
      },
    ];

    const filtered = mockTransactions.filter((tx) =>
      accountIds.includes(tx.accountId),
    );
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
    ],
  );

  return result;
}

// ========================================
// Razorpay Payment Records
// ========================================

const PAYMENTS_COLLECTION_ID =
  process.env.NEXT_PUBLIC_APPWRITE_PAYMENTS_COLLECTION_ID || "payments";

/**
 * Create a payment record in the database.
 * In demo mode, returns a mock payment record without calling Appwrite.
 */
export async function createPaymentRecord(params: {
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  status: PaymentRecord["status"];
  method: PaymentRecord["method"];
  description: string;
}): Promise<PaymentRecord> {
  // Demo mode — return mock record
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const mockPayment: PaymentRecord = {
      id: `payment_${Date.now()}`,
      $id: `payment_${Date.now()}`,
      userId: params.userId,
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      amount: params.amount,
      currency: params.currency,
      status: params.status,
      method: params.method,
      description: params.description,
      createdAt: new Date().toISOString(),
    };
    return mockPayment;
  }

  const { databases } = createServerClient();

  const doc = await databases.createDocument(
    DATABASE_ID,
    PAYMENTS_COLLECTION_ID,
    ID.unique(),
    {
      userId: params.userId,
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      amount: params.amount,
      currency: params.currency,
      status: params.status,
      method: params.method,
      description: params.description,
      createdAt: new Date().toISOString(),
    },
  );

  return {
    id: doc.$id,
    $id: doc.$id,
    userId: doc.userId,
    razorpayOrderId: doc.razorpayOrderId,
    razorpayPaymentId: doc.razorpayPaymentId,
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    method: doc.method,
    description: doc.description,
    createdAt: doc.createdAt,
  };
}

/**
 * Get payment records for a user.
 * In demo mode, returns mock payments.
 */
export async function getPaymentsByUserId(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<{ documents: PaymentRecord[]; total: number }> {
  // Demo mode — return mock payments
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const mockPayments: PaymentRecord[] = [
      {
        id: "pay_001",
        $id: "pay_001",
        userId,
        razorpayOrderId: "order_demo_1738000000001",
        razorpayPaymentId: "pay_demo_ABC123",
        amount: 2500,
        currency: "INR",
        status: "paid",
        method: "upi",
        description: "UPI transfer to savings",
        createdAt: "2025-01-27T14:30:00Z",
      },
      {
        id: "pay_002",
        $id: "pay_002",
        userId,
        razorpayOrderId: "order_demo_1738000000002",
        razorpayPaymentId: "pay_demo_DEF456",
        amount: 500,
        currency: "INR",
        status: "paid",
        method: "card",
        description: "Credit card bill payment",
        createdAt: "2025-01-26T10:15:00Z",
      },
      {
        id: "pay_003",
        $id: "pay_003",
        userId,
        razorpayOrderId: "order_demo_1738000000003",
        razorpayPaymentId: "pay_demo_GHI789",
        amount: 10000,
        currency: "INR",
        status: "paid",
        method: "netbanking",
        description: "Rent payment",
        createdAt: "2025-01-25T08:00:00Z",
      },
    ];

    const paged = mockPayments.slice(offset, offset + limit);
    return { documents: paged, total: mockPayments.length };
  }

  const { databases } = createServerClient();

  const result = await databases.listDocuments(
    DATABASE_ID,
    PAYMENTS_COLLECTION_ID,
    [
      Query.equal("userId", userId),
      Query.orderDesc("createdAt"),
      Query.limit(limit),
      Query.offset(offset),
    ],
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const documents: PaymentRecord[] = result.documents.map((doc: any) => ({
    id: doc.$id,
    $id: doc.$id,
    userId: doc.userId,
    razorpayOrderId: doc.razorpayOrderId,
    razorpayPaymentId: doc.razorpayPaymentId,
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    method: doc.method,
    description: doc.description,
    createdAt: doc.createdAt,
  }));

  return { documents, total: result.total };
}
