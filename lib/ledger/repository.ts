/**
 * BankVerse — Ledger Repository
 *
 * All data access for the double-entry ledger layer.
 * Uses in-memory & Supabase store for high-performance atomic ledger operations.
 */

import type { LedgerAccount, LedgerEntry, PaymentTransaction } from "./types";
import { createOutboxEvent, outboxStore } from "./outbox";

// ─── Helpers ────────────────────────────────────────────────────

export function isDemoMode(): boolean {
  return true;
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Entity Mutex Lock for Atomic OCC Operations ─────────────────

const entityLocks = new Map<string, Promise<unknown>>();

export async function runWithEntityLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const currentLock = entityLocks.get(key) || Promise.resolve();
  let releaseLock: () => void;
  const nextLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  entityLocks.set(key, currentLock.then(() => nextLock));

  try {
    await currentLock;
    return await fn();
  } finally {
    releaseLock!();
    if (entityLocks.get(key) === nextLock) {
      entityLocks.delete(key);
    }
  }
}

// ─── In-memory store ───────────────────────────────────────

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
  return (
    demoStore.ledgerAccounts.find(
      (a) => a.userId === userId && a.currency === currency,
    ) ?? null
  );
}

export async function createAccount(
  userId: string,
  currency: string,
  accountType: LedgerAccount["accountType"] = "CUSTOMER",
): Promise<LedgerAccount> {
  const account: LedgerAccount = {
    id: generateId("lacct"),
    userId,
    currency,
    accountType,
    totalDebits: 0,
    totalCredits: 0,
    derivedBalance: 0,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  demoStore.ledgerAccounts.push(account);
  return account;
}

export async function getAccountById(
  accountId: string,
): Promise<LedgerAccount | null> {
  return demoStore.ledgerAccounts.find((a) => a.id === accountId) ?? null;
}

export async function updateAccountAggregates(
  accountId: string,
  expectedVersion?: number,
): Promise<LedgerAccount | null> {
  const account = demoStore.ledgerAccounts.find((a) => a.id === accountId);
  if (!account) return null;

  if (expectedVersion !== undefined && account.version !== expectedVersion) {
    throw new Error(
      `OCC Conflict: Account ${accountId} version mismatch. Expected ${expectedVersion}, got ${account.version}`,
    );
  }

  const entries = demoStore.ledgerEntries.filter(
    (e) => e.accountId === accountId,
  );
  const totalDebits = entries
    .filter((e) => e.entryType === "DEBIT")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalCredits = entries
    .filter((e) => e.entryType === "CREDIT")
    .reduce((sum, e) => sum + e.amount, 0);

  account.totalDebits = totalDebits;
  account.totalCredits = totalCredits;
  account.derivedBalance = totalCredits - totalDebits;
  account.version = (account.version ?? 1) + 1;
  account.updatedAt = new Date().toISOString();
  return account;
}

// ─── Payment Transaction CRUD ───────────────────────────────────

export async function createPaymentTransaction(data: {
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  provider: string;
  providerReference: string;
  providerOrderId?: string;
  idempotencyKey: string;
  method?: string;
  bank?: string;
}): Promise<PaymentTransaction> {
  const existing = demoStore.paymentTransactions.find(
    (t) => t.idempotencyKey === data.idempotencyKey,
  );
  if (existing) return existing;

  const tx: PaymentTransaction = {
    id: generateId("ptx"),
    customerId: data.customerId,
    merchantId: data.merchantId,
    amount: data.amount,
    currency: data.currency,
    method: data.method,
    bank: data.bank,
    paymentState: "PROCESSING",
    settlementState: "NOT_REQUIRED",
    provider: data.provider,
    providerOrderId: data.providerOrderId,
    providerReference: data.providerReference,
    idempotencyKey: data.idempotencyKey,
    retryCount: 0,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  demoStore.paymentTransactions.push(tx);
  return tx;
}

export async function getPaymentTransactionById(
  id: string,
): Promise<PaymentTransaction | null> {
  return demoStore.paymentTransactions.find((t) => t.id === id) ?? null;
}

export async function getPaymentTransactionByIdempotencyKey(
  key: string,
): Promise<PaymentTransaction | null> {
  return (
    demoStore.paymentTransactions.find((t) => t.idempotencyKey === key) ?? null
  );
}

export async function getPaymentTransactionByProviderOrderId(
  providerOrderId: string,
): Promise<PaymentTransaction | null> {
  return (
    demoStore.paymentTransactions.find(
      (t) => t.providerOrderId === providerOrderId,
    ) ?? null
  );
}

export async function updatePaymentTransactionState(
  id: string,
  paymentState: PaymentTransaction["paymentState"],
  settlementState: PaymentTransaction["settlementState"],
  extra?: {
    providerPaymentId?: string;
    providerRefundId?: string;
    retryCount?: number;
  },
  expectedVersion?: number,
): Promise<PaymentTransaction | null> {
  const tx = demoStore.paymentTransactions.find((t) => t.id === id);
  if (!tx) return null;

  if (expectedVersion !== undefined && tx.version !== expectedVersion) {
    throw new Error(
      `OCC Conflict: Transaction ${id} version mismatch. Expected ${expectedVersion}, got ${tx.version}`,
    );
  }

  tx.paymentState = paymentState;
  tx.settlementState = settlementState;
  tx.version = (tx.version ?? 1) + 1;
  if (extra?.providerPaymentId)
    tx.providerPaymentId = extra.providerPaymentId;
  if (extra?.providerRefundId) tx.providerRefundId = extra.providerRefundId;
  if (extra?.retryCount !== undefined) tx.retryCount = extra.retryCount;
  tx.updatedAt = new Date().toISOString();

  return tx;
}
export async function executeAtomicSettlementInDemoMode(params: {
  transactionId: string;
  expectedVersion?: number;
  clearingAccountId: string;
  merchantAccountId: string;
  amount: number;
  currency: string;
  merchantId: string;
  options?: { simulateFailureStage?: "MERCHANT_CREDIT_FAIL" };
}): Promise<{ debitEntry: LedgerEntry; creditEntry: LedgerEntry }> {
  const {
    transactionId,
    expectedVersion,
    clearingAccountId,
    merchantAccountId,
    amount,
    currency,
    merchantId,
    options,
  } = params;

  const tx = demoStore.paymentTransactions.find((t) => t.id === transactionId);
  if (!tx) throw new Error(`Transaction ${transactionId} not found`);

  const targetVersion = expectedVersion ?? tx.version;
  if (tx.version !== targetVersion) {
    throw new Error(
      `OCC Conflict: Settlement version mismatch for transaction ${transactionId}. Expected ${targetVersion}, got ${tx.version}`,
    );
  }

  // Idempotency check: if settlement entries already exist in demo store
  const existingDebit = demoStore.ledgerEntries.find(
    (e) =>
      e.transactionId === transactionId &&
      e.entryType === "DEBIT" &&
      e.description.startsWith("SETTLEMENT:"),
  );
  const existingCredit = demoStore.ledgerEntries.find(
    (e) =>
      e.transactionId === transactionId &&
      e.entryType === "CREDIT" &&
      e.description.startsWith("SETTLEMENT:"),
  );
  if (existingDebit && existingCredit) {
    return { debitEntry: existingDebit, creditEntry: existingCredit };
  }

  // Save full state snapshot for atomic rollback
  const initialTxVersion = tx.version;
  const initialSettlementState = tx.settlementState;
  const initialUpdatedAt = tx.updatedAt;
  // Track specific IDs created during this operation for precise rollback,
  // rather than truncating arrays which would lose concurrent operations.
  const createdEntryIds: string[] = [];
  const createdOutboxIds: string[] = [];

  const clearingAcct = demoStore.ledgerAccounts.find((a) => a.id === clearingAccountId);
  const merchantAcct = demoStore.ledgerAccounts.find((a) => a.id === merchantAccountId);

  const initialClearingSnap = clearingAcct ? { ...clearingAcct } : null;
  const initialMerchantSnap = merchantAcct ? { ...merchantAcct } : null;

  try {
    // 1. Transaction state transition + version increment
    tx.settlementState = "RESOLVED";
    tx.version = (tx.version ?? 1) + 1;
    tx.updatedAt = new Date().toISOString();

    // 2. Clearing DEBIT entry
    const debitEntry: LedgerEntry = {
      id: generateId("lentry"),
      transactionId,
      accountId: clearingAccountId,
      entryType: "DEBIT",
      amount,
      currency,
      description: `SETTLEMENT: release from clearing to ${merchantId}`,
      createdAt: new Date().toISOString(),
    };
    demoStore.ledgerEntries.push(debitEntry);
    createdEntryIds.push(debitEntry.id);

    // Simulated failure point: payment updated ✓, clearing debited ✓, merchant credit 💥
    if (options?.simulateFailureStage === "MERCHANT_CREDIT_FAIL") {
      throw new Error("SIMULATED_MERCHANT_CREDIT_FAILURE");
    }

    // 3. Merchant CREDIT entry
    const creditEntry: LedgerEntry = {
      id: generateId("lentry"),
      transactionId,
      accountId: merchantAccountId,
      entryType: "CREDIT",
      amount,
      currency,
      description: `SETTLEMENT: credit to ${merchantId}`,
      createdAt: new Date().toISOString(),
    };
    demoStore.ledgerEntries.push(creditEntry);
    createdEntryIds.push(creditEntry.id);

    // 4. Update Clearing Account Aggregates
    if (clearingAcct) {
      const cEntries = demoStore.ledgerEntries.filter((e) => e.accountId === clearingAccountId);
      const cDebits = cEntries.filter((e) => e.entryType === "DEBIT").reduce((sum, e) => sum + e.amount, 0);
      const cCredits = cEntries.filter((e) => e.entryType === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
      clearingAcct.totalDebits = cDebits;
      clearingAcct.totalCredits = cCredits;
      clearingAcct.derivedBalance = cCredits - cDebits;
      clearingAcct.version = (clearingAcct.version ?? 1) + 1;
      clearingAcct.updatedAt = new Date().toISOString();
    }

    // 5. Update Merchant Account Aggregates
    if (merchantAcct) {
      const mEntries = demoStore.ledgerEntries.filter((e) => e.accountId === merchantAccountId);
      const mDebits = mEntries.filter((e) => e.entryType === "DEBIT").reduce((sum, e) => sum + e.amount, 0);
      const mCredits = mEntries.filter((e) => e.entryType === "CREDIT").reduce((sum, e) => sum + e.amount, 0);
      merchantAcct.totalDebits = mDebits;
      merchantAcct.totalCredits = mCredits;
      merchantAcct.derivedBalance = mCredits - mDebits;
      merchantAcct.version = (merchantAcct.version ?? 1) + 1;
      merchantAcct.updatedAt = new Date().toISOString();
    }

    // 6. Create Outbox Event
    const outboxEvent = await createOutboxEvent({
      aggregateId: transactionId,
      eventType: "PAYMENT_SETTLED",
      payload: {
        transactionId,
        amount,
        currency,
        merchantId,
        version: tx.version,
        settlementState: "RESOLVED",
      },
    });
    createdOutboxIds.push(outboxEvent.id);

    return { debitEntry, creditEntry };
  } catch (err) {
    // Precise rollback: only remove items created during this operation.
    // This avoids losing concurrent operations' entries/outbox events.
    tx.version = initialTxVersion;
    tx.settlementState = initialSettlementState;
    tx.updatedAt = initialUpdatedAt;

    // Remove only the ledger entries we created
    for (const entryId of createdEntryIds) {
      const idx = demoStore.ledgerEntries.findIndex((e) => e.id === entryId);
      if (idx !== -1) demoStore.ledgerEntries.splice(idx, 1);
    }

    // Remove only the outbox events we created
    for (const outboxId of createdOutboxIds) {
      const idx = outboxStore.findIndex((e) => e.id === outboxId);
      if (idx !== -1) outboxStore.splice(idx, 1);
    }

    if (clearingAcct && initialClearingSnap) Object.assign(clearingAcct, initialClearingSnap);
    if (merchantAcct && initialMerchantSnap) Object.assign(merchantAcct, initialMerchantSnap);
    throw err;
  }
}



export async function getAllPaymentTransactions(
  limit = 100,
  offset = 0,
): Promise<PaymentTransaction[]> {
  return demoStore.paymentTransactions.slice(offset, offset + limit);
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

export async function deleteLedgerEntry(id: string): Promise<void> {
  const index = demoStore.ledgerEntries.findIndex((e) => e.id === id);
  if (index !== -1) {
    demoStore.ledgerEntries.splice(index, 1);
  }
}

export async function getLedgerEntriesByTransaction(
  transactionId: string,
): Promise<LedgerEntry[]> {
  return demoStore.ledgerEntries.filter(
    (e) => e.transactionId === transactionId,
  );
}

export async function getLedgerEntriesByAccount(
  accountId: string,
  limit = 20,
  offset = 0,
): Promise<LedgerEntry[]> {
  const entries = demoStore.ledgerEntries
    .filter((e) => e.accountId === accountId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  return entries.slice(offset, offset + limit);
}

export async function getAllLedgerEntries(
  limit = 5000,
): Promise<LedgerEntry[]> {
  return demoStore.ledgerEntries.slice(0, limit);
}
