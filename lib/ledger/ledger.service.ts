/**
 * BankVerse — Double-Entry Ledger Service
 *
 * Inspired by Blnk. Core principles:
 * 1. Append-only — entries are never updated or deleted
 * 2. Balances are derived from entries, not stored as mutable fields
 * 3. SUM(debits) === SUM(credits) is enforced at transaction time
 * 4. Reversals create new entries, never modify originals
 */

import { ID, Query } from "node-appwrite";
import {
  createServerClient,
  DATABASE_ID,
  LEDGER_ACCOUNTS_COLLECTION_ID,
  LEDGER_ENTRIES_COLLECTION_ID,
  PAYMENT_TRANSACTIONS_COLLECTION_ID,
} from "@/lib/appwrite/config";
import type {
  LedgerAccount,
  LedgerEntry,
  PaymentTransaction,
  RecordTransactionParams,
  RecordTransactionResult,
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────

function getDb() {
  const { databases } = createServerClient();
  return databases;
}

function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

// ─── In-memory demo store ───────────────────────────────────────

const demoStore: {
  ledgerAccounts: LedgerAccount[];
  ledgerEntries: LedgerEntry[];
  paymentTransactions: PaymentTransaction[];
} = {
  ledgerAccounts: [],
  ledgerEntries: [],
  paymentTransactions: [],
};

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Ledger Account ─────────────────────────────────────────────

export async function getOrCreateLedgerAccount(
  userId: string,
  currency = "INR",
): Promise<LedgerAccount> {
  if (isDemoMode()) {
    const existing = demoStore.ledgerAccounts.find(
      (a) => a.userId === userId && a.currency === currency,
    );
    if (existing) return existing;

    const account: LedgerAccount = {
      id: generateId("lacct"),
      userId,
      currency,
      totalDebits: 0,
      totalCredits: 0,
      derivedBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    demoStore.ledgerAccounts.push(account);
    return account;
  }

  const db = getDb();

  // Try to find existing
  const existing = await db.listDocuments(
    DATABASE_ID,
    LEDGER_ACCOUNTS_COLLECTION_ID,
    [
      Query.equal("userId", userId),
      Query.equal("currency", currency),
      Query.limit(1),
    ],
  );

  if (existing.documents.length > 0) {
    const doc = existing.documents[0];
    return {
      id: doc.$id,
      userId: doc.userId,
      currency: doc.currency,
      totalDebits: doc.totalDebits,
      totalCredits: doc.totalCredits,
      derivedBalance: doc.derivedBalance,
      createdAt: doc.$createdAt,
      updatedAt: doc.$updatedAt,
    };
  }

  // Create new
  const doc = await db.createDocument(
    DATABASE_ID,
    LEDGER_ACCOUNTS_COLLECTION_ID,
    ID.unique(),
    {
      userId,
      currency,
      totalDebits: 0,
      totalCredits: 0,
      derivedBalance: 0,
    },
  );

  return {
    id: doc.$id,
    userId: doc.userId,
    currency: doc.currency,
    totalDebits: doc.totalDebits,
    totalCredits: doc.totalCredits,
    derivedBalance: doc.derivedBalance,
    createdAt: doc.$createdAt,
    updatedAt: doc.$updatedAt,
  };
}

// ─── Record Transaction (Core) ──────────────────────────────────

export async function recordTransaction(
  params: RecordTransactionParams,
): Promise<RecordTransactionResult> {
  const {
    customerId,
    merchantId,
    amount,
    currency,
    provider,
    providerReference,
    idempotencyKey,
    description = "Payment",
  } = params;

  // 1. Idempotency check
  const existing = await getPaymentTransactionByIdempotencyKey(idempotencyKey);
  if (existing) {
    // Return existing entries
    const entries = await getLedgerEntriesByTransaction(existing.id);
    const debitEntry = entries.find((e) => e.entryType === "DEBIT")!;
    const creditEntry = entries.find((e) => e.entryType === "CREDIT")!;
    return { transaction: existing, debitEntry, creditEntry };
  }

  // 2. Validate: SUM(debits) === SUM(credits)
  // For a simple payment: one DEBIT (customer) + one CREDIT (merchant)
  const debitAmount = amount;
  const creditAmount = amount;
  if (debitAmount !== creditAmount) {
    throw new Error(
      `Ledger validation failed: SUM(debits)=${debitAmount} !== SUM(credits)=${creditAmount}`,
    );
  }

  // 3. Get or create ledger accounts
  const customerAccount = await getOrCreateLedgerAccount(customerId, currency);
  const merchantAccount = await getOrCreateLedgerAccount(merchantId, currency);

  // 4. Create payment transaction
  const transaction = await createPaymentTransactionInternal({
    customerId,
    merchantId,
    amount,
    currency,
    provider,
    providerReference,
    idempotencyKey,
  });

  // 5. Create ledger entries (append-only)
  const debitEntry = await createLedgerEntryInternal({
    transactionId: transaction.id,
    accountId: customerAccount.id,
    entryType: "DEBIT",
    amount,
    currency,
    description: `${description} — debit from ${customerId}`,
  });

  const creditEntry = await createLedgerEntryInternal({
    transactionId: transaction.id,
    accountId: merchantAccount.id,
    entryType: "CREDIT",
    amount,
    currency,
    description: `${description} — credit to ${merchantId}`,
  });

  // 6. Update account aggregates
  await updateAccountAggregates(customerAccount.id);
  await updateAccountAggregates(merchantAccount.id);

  return { transaction, debitEntry, creditEntry };
}

// ─── Reverse Transaction ────────────────────────────────────────

export async function reverseTransaction(
  transactionId: string,
  reason: string,
): Promise<{ debitEntry: LedgerEntry; creditEntry: LedgerEntry }> {
  const transaction = await getPaymentTransactionById(transactionId);
  if (!transaction) throw new Error(`Transaction ${transactionId} not found`);

  const originalEntries = await getLedgerEntriesByTransaction(transactionId);
  const originalDebit = originalEntries.find((e) => e.entryType === "DEBIT");
  const originalCredit = originalEntries.find((e) => e.entryType === "CREDIT");

  if (!originalDebit || !originalCredit) {
    throw new Error(
      `Incomplete ledger entries for transaction ${transactionId}`,
    );
  }

  // Create reversal entries (NEVER modify originals)
  // Reverse: CREDIT the customer, DEBIT the merchant
  const reversalDebit = await createLedgerEntryInternal({
    transactionId,
    accountId: originalCredit.accountId, // merchant gets debited
    entryType: "DEBIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `REVERSAL: ${reason}`,
  });

  const reversalCredit = await createLedgerEntryInternal({
    transactionId,
    accountId: originalDebit.accountId, // customer gets credited
    entryType: "CREDIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `REVERSAL: ${reason}`,
  });

  // Update aggregates
  await updateAccountAggregates(originalCredit.accountId);
  await updateAccountAggregates(originalDebit.accountId);

  return { debitEntry: reversalDebit, creditEntry: reversalCredit };
}

// ─── Get Balance (Derived) ──────────────────────────────────────

export async function getBalance(accountId: string): Promise<{
  totalDebits: number;
  totalCredits: number;
  derivedBalance: number;
}> {
  if (isDemoMode()) {
    const account = demoStore.ledgerAccounts.find((a) => a.id === accountId);
    if (!account) return { totalDebits: 0, totalCredits: 0, derivedBalance: 0 };
    return {
      totalDebits: account.totalDebits,
      totalCredits: account.totalCredits,
      derivedBalance: account.derivedBalance,
    };
  }

  const db = getDb();
  const doc = await db.getDocument(
    DATABASE_ID,
    LEDGER_ACCOUNTS_COLLECTION_ID,
    accountId,
  );

  return {
    totalDebits: doc.totalDebits,
    totalCredits: doc.totalCredits,
    derivedBalance: doc.derivedBalance,
  };
}

// ─── Get Transaction History ────────────────────────────────────

export async function getTransactionHistory(
  accountId: string,
  limit = 20,
  offset = 0,
): Promise<LedgerEntry[]> {
  if (isDemoMode()) {
    const entries = demoStore.ledgerEntries
      .filter((e) => e.accountId === accountId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    return entries.slice(offset, offset + limit);
  }

  const db = getDb();
  const result = await db.listDocuments(
    DATABASE_ID,
    LEDGER_ENTRIES_COLLECTION_ID,
    [
      Query.equal("accountId", accountId),
      Query.orderDesc("createdAt"),
      Query.limit(limit),
      Query.offset(offset),
    ],
  );

  return result.documents.map((doc) => ({
    id: doc.$id,
    transactionId: doc.transactionId,
    accountId: doc.accountId,
    entryType: doc.entryType,
    amount: doc.amount,
    currency: doc.currency,
    description: doc.description,
    createdAt: doc.createdAt || doc.$createdAt,
  }));
}

// ─── Integrity Check ────────────────────────────────────────────

export async function verifyLedgerIntegrity(): Promise<{
  valid: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
}> {
  if (isDemoMode()) {
    const totalDebits = demoStore.ledgerEntries
      .filter((e) => e.entryType === "DEBIT")
      .reduce((sum, e) => sum + e.amount, 0);
    const totalCredits = demoStore.ledgerEntries
      .filter((e) => e.entryType === "CREDIT")
      .reduce((sum, e) => sum + e.amount, 0);

    return {
      valid: totalDebits === totalCredits,
      totalDebits,
      totalCredits,
      difference: totalDebits - totalCredits,
    };
  }

  const db = getDb();
  const allEntries = await db.listDocuments(
    DATABASE_ID,
    LEDGER_ENTRIES_COLLECTION_ID,
    [Query.limit(5000)],
  );

  let totalDebits = 0;
  let totalCredits = 0;

  for (const doc of allEntries.documents) {
    if (doc.entryType === "DEBIT") totalDebits += doc.amount;
    else if (doc.entryType === "CREDIT") totalCredits += doc.amount;
  }

  return {
    valid: totalDebits === totalCredits,
    totalDebits,
    totalCredits,
    difference: totalDebits - totalCredits,
  };
}

// ─── Internal Helpers ───────────────────────────────────────────

async function createPaymentTransactionInternal(data: {
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
}): Promise<PaymentTransaction> {
  if (isDemoMode()) {
    const tx: PaymentTransaction = {
      id: generateId("ptx"),
      customerId: data.customerId,
      merchantId: data.merchantId,
      amount: data.amount,
      currency: data.currency,
      paymentState: "PROCESSING",
      settlementState: "NOT_REQUIRED",
      provider: data.provider,
      providerReference: data.providerReference,
      idempotencyKey: data.idempotencyKey,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    demoStore.paymentTransactions.push(tx);
    return tx;
  }

  const db = getDb();
  const doc = await db.createDocument(
    DATABASE_ID,
    PAYMENT_TRANSACTIONS_COLLECTION_ID,
    ID.unique(),
    {
      customerId: data.customerId,
      merchantId: data.merchantId,
      amount: data.amount,
      currency: data.currency,
      paymentState: "PROCESSING",
      settlementState: "NOT_REQUIRED",
      provider: data.provider,
      providerReference: data.providerReference,
      idempotencyKey: data.idempotencyKey,
      retryCount: 0,
    },
  );

  return {
    id: doc.$id,
    customerId: doc.customerId,
    merchantId: doc.merchantId,
    amount: doc.amount,
    currency: doc.currency,
    paymentState: doc.paymentState,
    settlementState: doc.settlementState,
    provider: doc.provider,
    providerReference: doc.providerReference,
    idempotencyKey: doc.idempotencyKey,
    retryCount: doc.retryCount,
    createdAt: doc.$createdAt,
    updatedAt: doc.$updatedAt,
  };
}

async function createLedgerEntryInternal(data: {
  transactionId: string;
  accountId: string;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  currency: string;
  description: string;
}): Promise<LedgerEntry> {
  if (isDemoMode()) {
    const entry: LedgerEntry = {
      id: generateId("lentry"),
      transactionId: data.transactionId,
      accountId: data.accountId,
      entryType: data.entryType,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      createdAt: new Date().toISOString(),
    };
    demoStore.ledgerEntries.push(entry);
    return entry;
  }

  const db = getDb();
  const doc = await db.createDocument(
    DATABASE_ID,
    LEDGER_ENTRIES_COLLECTION_ID,
    ID.unique(),
    {
      transactionId: data.transactionId,
      accountId: data.accountId,
      entryType: data.entryType,
      amount: data.amount,
      currency: data.currency,
      description: data.description,
      createdAt: new Date().toISOString(),
    },
  );

  return {
    id: doc.$id,
    transactionId: doc.transactionId,
    accountId: doc.accountId,
    entryType: doc.entryType,
    amount: doc.amount,
    currency: doc.currency,
    description: doc.description,
    createdAt: doc.createdAt,
  };
}

async function updateAccountAggregates(accountId: string): Promise<void> {
  if (isDemoMode()) {
    const entries = demoStore.ledgerEntries.filter(
      (e) => e.accountId === accountId,
    );
    const totalDebits = entries
      .filter((e) => e.entryType === "DEBIT")
      .reduce((sum, e) => sum + e.amount, 0);
    const totalCredits = entries
      .filter((e) => e.entryType === "CREDIT")
      .reduce((sum, e) => sum + e.amount, 0);

    const account = demoStore.ledgerAccounts.find((a) => a.id === accountId);
    if (account) {
      account.totalDebits = totalDebits;
      account.totalCredits = totalCredits;
      account.derivedBalance = totalCredits - totalDebits;
      account.updatedAt = new Date().toISOString();
    }
    return;
  }

  const db = getDb();
  const entries = await db.listDocuments(
    DATABASE_ID,
    LEDGER_ENTRIES_COLLECTION_ID,
    [Query.equal("accountId", accountId), Query.limit(5000)],
  );

  let totalDebits = 0;
  let totalCredits = 0;
  for (const doc of entries.documents) {
    if (doc.entryType === "DEBIT") totalDebits += doc.amount;
    else if (doc.entryType === "CREDIT") totalCredits += doc.amount;
  }

  await db.updateDocument(
    DATABASE_ID,
    LEDGER_ACCOUNTS_COLLECTION_ID,
    accountId,
    {
      totalDebits,
      totalCredits,
      derivedBalance: totalCredits - totalDebits,
    },
  );
}

// ─── Query Helpers ──────────────────────────────────────────────

export async function getPaymentTransactionById(
  id: string,
): Promise<PaymentTransaction | null> {
  if (isDemoMode()) {
    return demoStore.paymentTransactions.find((t) => t.id === id) ?? null;
  }

  const db = getDb();
  try {
    const doc = await db.getDocument(
      DATABASE_ID,
      PAYMENT_TRANSACTIONS_COLLECTION_ID,
      id,
    );
    return {
      id: doc.$id,
      customerId: doc.customerId,
      merchantId: doc.merchantId,
      amount: doc.amount,
      currency: doc.currency,
      paymentState: doc.paymentState,
      settlementState: doc.settlementState,
      provider: doc.provider,
      providerReference: doc.providerReference,
      idempotencyKey: doc.idempotencyKey,
      retryCount: doc.retryCount ?? 0,
      createdAt: doc.$createdAt,
      updatedAt: doc.$updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getPaymentTransactionByIdempotencyKey(
  key: string,
): Promise<PaymentTransaction | null> {
  if (isDemoMode()) {
    return (
      demoStore.paymentTransactions.find((t) => t.idempotencyKey === key) ??
      null
    );
  }

  const db = getDb();
  const result = await db.listDocuments(
    DATABASE_ID,
    PAYMENT_TRANSACTIONS_COLLECTION_ID,
    [Query.equal("idempotencyKey", key), Query.limit(1)],
  );

  if (result.documents.length === 0) return null;

  const doc = result.documents[0];
  return {
    id: doc.$id,
    customerId: doc.customerId,
    merchantId: doc.merchantId,
    amount: doc.amount,
    currency: doc.currency,
    paymentState: doc.paymentState,
    settlementState: doc.settlementState,
    provider: doc.provider,
    providerReference: doc.providerReference,
    idempotencyKey: doc.idempotencyKey,
    retryCount: doc.retryCount ?? 0,
    createdAt: doc.$createdAt,
    updatedAt: doc.$updatedAt,
  };
}

export async function getLedgerEntriesByTransaction(
  transactionId: string,
): Promise<LedgerEntry[]> {
  if (isDemoMode()) {
    return demoStore.ledgerEntries.filter(
      (e) => e.transactionId === transactionId,
    );
  }

  const db = getDb();
  const result = await db.listDocuments(
    DATABASE_ID,
    LEDGER_ENTRIES_COLLECTION_ID,
    [Query.equal("transactionId", transactionId), Query.limit(100)],
  );

  return result.documents.map((doc) => ({
    id: doc.$id,
    transactionId: doc.transactionId,
    accountId: doc.accountId,
    entryType: doc.entryType,
    amount: doc.amount,
    currency: doc.currency,
    description: doc.description,
    createdAt: doc.createdAt || doc.$createdAt,
  }));
}

export async function updatePaymentTransactionState(
  id: string,
  paymentState: PaymentTransaction["paymentState"],
  settlementState: PaymentTransaction["settlementState"],
): Promise<PaymentTransaction | null> {
  if (isDemoMode()) {
    const tx = demoStore.paymentTransactions.find((t) => t.id === id);
    if (!tx) return null;
    tx.paymentState = paymentState;
    tx.settlementState = settlementState;
    tx.updatedAt = new Date().toISOString();
    return tx;
  }

  const db = getDb();
  const doc = await db.updateDocument(
    DATABASE_ID,
    PAYMENT_TRANSACTIONS_COLLECTION_ID,
    id,
    { paymentState, settlementState },
  );

  return {
    id: doc.$id,
    customerId: doc.customerId,
    merchantId: doc.merchantId,
    amount: doc.amount,
    currency: doc.currency,
    paymentState: doc.paymentState,
    settlementState: doc.settlementState,
    provider: doc.provider,
    providerReference: doc.providerReference,
    idempotencyKey: doc.idempotencyKey,
    retryCount: doc.retryCount ?? 0,
    createdAt: doc.$createdAt,
    updatedAt: doc.$updatedAt,
  };
}

export async function getAllPaymentTransactions(
  limit = 100,
  offset = 0,
): Promise<PaymentTransaction[]> {
  if (isDemoMode()) {
    return demoStore.paymentTransactions.slice(offset, offset + limit);
  }

  const db = getDb();
  const result = await db.listDocuments(
    DATABASE_ID,
    PAYMENT_TRANSACTIONS_COLLECTION_ID,
    [Query.orderDesc("$createdAt"), Query.limit(limit), Query.offset(offset)],
  );

  return result.documents.map((doc) => ({
    id: doc.$id,
    customerId: doc.customerId,
    merchantId: doc.merchantId,
    amount: doc.amount,
    currency: doc.currency,
    paymentState: doc.paymentState,
    settlementState: doc.settlementState,
    provider: doc.provider,
    providerReference: doc.providerReference,
    idempotencyKey: doc.idempotencyKey,
    retryCount: doc.retryCount ?? 0,
    createdAt: doc.$createdAt,
    updatedAt: doc.$updatedAt,
  }));
}
