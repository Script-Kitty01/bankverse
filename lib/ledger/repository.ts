/**
 * BankVerse — Ledger Repository
 *
 * All data access for the ledger layer. Handles both demo mode
 * (in-memory store) and production (Appwrite) persistence.
 * Never imported directly — use ledger.service.ts public API.
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
} from "./types";

// ─── Helpers ────────────────────────────────────────────────────

export function getDb() {
  const { databases } = createServerClient();
  return databases;
}

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── In-memory demo store ───────────────────────────────────────

export const demoStore: {
  ledgerAccounts: LedgerAccount[];
  ledgerEntries: LedgerEntry[];
  paymentTransactions: PaymentTransaction[];
} = {
  ledgerAccounts: [],
  ledgerEntries: [],
  paymentTransactions: [],
};

// ─── Ledger Account CRUD ────────────────────────────────────────

export async function findAccount(
  userId: string,
  currency: string,
): Promise<LedgerAccount | null> {
  if (isDemoMode()) {
    return (
      demoStore.ledgerAccounts.find(
        (a) => a.userId === userId && a.currency === currency,
      ) ?? null
    );
  }

  const db = getDb();
  const existing = await db.listDocuments(
    DATABASE_ID,
    LEDGER_ACCOUNTS_COLLECTION_ID,
    [
      Query.equal("userId", userId),
      Query.equal("currency", currency),
      Query.limit(1),
    ],
  );

  if (existing.documents.length === 0) return null;

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

export async function createAccount(
  userId: string,
  currency: string,
): Promise<LedgerAccount> {
  if (isDemoMode()) {
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
  const doc = await db.createDocument(
    DATABASE_ID,
    LEDGER_ACCOUNTS_COLLECTION_ID,
    ID.unique(),
    { userId, currency, totalDebits: 0, totalCredits: 0, derivedBalance: 0 },
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

export async function getAccountById(
  accountId: string,
): Promise<LedgerAccount | null> {
  if (isDemoMode()) {
    return demoStore.ledgerAccounts.find((a) => a.id === accountId) ?? null;
  }

  const db = getDb();
  try {
    const doc = await db.getDocument(
      DATABASE_ID,
      LEDGER_ACCOUNTS_COLLECTION_ID,
      accountId,
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
  } catch {
    return null;
  }
}

export async function updateAccountAggregates(
  accountId: string,
): Promise<void> {
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
    { totalDebits, totalCredits, derivedBalance: totalCredits - totalDebits },
  );
}

// ─── Payment Transaction CRUD ───────────────────────────────────

export async function createPaymentTransaction(data: {
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

// ─── Ledger Entry CRUD ──────────────────────────────────────────

export async function createLedgerEntry(data: {
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

export async function getLedgerEntriesByAccount(
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

export async function getAllLedgerEntries(
  limit = 5000,
): Promise<LedgerEntry[]> {
  if (isDemoMode()) {
    return demoStore.ledgerEntries.slice(0, limit);
  }

  const db = getDb();
  const result = await db.listDocuments(
    DATABASE_ID,
    LEDGER_ENTRIES_COLLECTION_ID,
    [Query.limit(limit)],
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
