/**
 * BankVerse — Double-Entry Ledger Service
 *
 * Inspired by Blnk. Core principles:
 * 1. Append-only — entries are never updated or deleted
 * 2. Balances are derived from entries, not stored as mutable fields
 * 3. SUM(debits) === SUM(credits) is enforced at transaction time
 * 4. Reversals create new entries, never modify originals
 *
 * Architecture:
 *   ledger.service.ts   — orchestration (this file)
 *   repository.ts       — data access (demo store + Appwrite CRUD)
 *   validation.ts       — invariants (double-entry, amount checks)
 *   balance.ts          — derived balance computation
 *   types.ts            — shared type definitions
 */

import type {
  LedgerAccount,
  LedgerEntry,
  RecordTransactionParams,
  RecordTransactionResult,
} from "./types";
import {
  findAccount,
  createAccount,
  getAccountById,
  updateAccountAggregates,
  createPaymentTransaction,
  getPaymentTransactionById,
  getPaymentTransactionByIdempotencyKey,
  updatePaymentTransactionState,
  getAllPaymentTransactions,
  createLedgerEntry,
  getLedgerEntriesByTransaction,
  getLedgerEntriesByAccount,
  getAllLedgerEntries,
} from "./repository";
import {
  validatePaymentEntries,
  validateReversalEntries,
  verifyLedgerIntegrity as validateIntegrity,
} from "./validation";
import { computeBalance, zeroBalance } from "./balance";

// ─── Ledger Account ─────────────────────────────────────────────

export async function getOrCreateLedgerAccount(
  userId: string,
  currency = "INR",
): Promise<LedgerAccount> {
  const existing = await findAccount(userId, currency);
  if (existing) return existing;
  return createAccount(userId, currency);
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
    const entries = await getLedgerEntriesByTransaction(existing.id);
    const debitEntry = entries.find((e) => e.entryType === "DEBIT")!;
    const creditEntry = entries.find((e) => e.entryType === "CREDIT")!;
    return { transaction: existing, debitEntry, creditEntry };
  }

  // 2. Validate: SUM(debits) === SUM(credits)
  validatePaymentEntries(amount, amount);

  // 3. Get or create ledger accounts
  const customerAccount = await getOrCreateLedgerAccount(customerId, currency);
  const merchantAccount = await getOrCreateLedgerAccount(merchantId, currency);

  // 4. Create payment transaction
  const transaction = await createPaymentTransaction({
    customerId,
    merchantId,
    amount,
    currency,
    provider,
    providerReference,
    idempotencyKey,
  });

  // 5. Create ledger entries (append-only)
  const debitEntry = await createLedgerEntry({
    transactionId: transaction.id,
    accountId: customerAccount.id,
    entryType: "DEBIT",
    amount,
    currency,
    description: `${description} — debit from ${customerId}`,
  });

  const creditEntry = await createLedgerEntry({
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

  // Idempotency: check if reversal entries already exist
  const allEntries = await getLedgerEntriesByTransaction(transactionId);
  const existingReversal = allEntries.find((e) =>
    e.description.startsWith("REVERSAL:"),
  );
  if (existingReversal) {
    const reversalDebit = allEntries.find(
      (e) => e.entryType === "DEBIT" && e.description.startsWith("REVERSAL:"),
    )!;
    const reversalCredit = allEntries.find(
      (e) => e.entryType === "CREDIT" && e.description.startsWith("REVERSAL:"),
    )!;
    return { debitEntry: reversalDebit, creditEntry: reversalCredit };
  }

  const originalEntries = allEntries.filter(
    (e) => !e.description.startsWith("REVERSAL:"),
  );
  const { debit: originalDebit, credit: originalCredit } =
    validateReversalEntries(originalEntries, transactionId);

  // Create reversal entries (NEVER modify originals)
  // Reverse: CREDIT the customer, DEBIT the merchant
  const reversalDebit = await createLedgerEntry({
    transactionId,
    accountId: originalCredit.accountId, // merchant gets debited
    entryType: "DEBIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `REVERSAL: ${reason}`,
  });

  const reversalCredit = await createLedgerEntry({
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
  const account = await getAccountById(accountId);
  if (!account) return zeroBalance();

  // Derive balance from entries (source of truth), not cached aggregates.
  // The cached aggregates are a performance optimization; we cross-check
  // them against the entry-derived balance and warn on drift.
  const entries = await getLedgerEntriesByAccount(accountId, 10_000, 0);
  const derived = computeBalance(entries);

  const cached = {
    totalDebits: account.totalDebits,
    totalCredits: account.totalCredits,
    derivedBalance: account.derivedBalance,
  };

  if (
    derived.totalDebits !== cached.totalDebits ||
    derived.totalCredits !== cached.totalCredits ||
    derived.derivedBalance !== cached.derivedBalance
  ) {
    console.warn(
      `[Ledger] Balance drift detected for account ${accountId}: ` +
        `cached(debits=${cached.totalDebits}, credits=${cached.totalCredits}, balance=${cached.derivedBalance}) ` +
        `vs derived(debits=${derived.totalDebits}, credits=${derived.totalCredits}, balance=${derived.derivedBalance})`,
    );
  }

  return derived;
}

// ─── Get Transaction History ────────────────────────────────────

export async function getTransactionHistory(
  accountId: string,
  limit = 20,
  offset = 0,
): Promise<LedgerEntry[]> {
  return getLedgerEntriesByAccount(accountId, limit, offset);
}

// ─── Integrity Check ────────────────────────────────────────────

export async function verifyLedgerIntegrity(): Promise<{
  valid: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
}> {
  const entries = await getAllLedgerEntries();
  return validateIntegrity(entries);
}

// ─── Re-exports for backward compatibility ──────────────────────

export { getPaymentTransactionById } from "./repository";
export { getPaymentTransactionByIdempotencyKey } from "./repository";
export { getLedgerEntriesByTransaction } from "./repository";
export { updatePaymentTransactionState } from "./repository";
export { getAllPaymentTransactions } from "./repository";
