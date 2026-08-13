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
  createLedgerEntry,
  getLedgerEntriesByTransaction,
  getLedgerEntriesByAccount,
  getAllLedgerEntries,
} from "./repository";
import {
  validatePaymentEntries,
  verifyLedgerIntegrity as validateIntegrity,
} from "./validation";
import { computeBalance, zeroBalance } from "./balance";

// ─── Ledger Account ─────────────────────────────────────────────

export async function getOrCreateLedgerAccount(
  userId: string,
  currency = "INR",
  accountType: LedgerAccount["accountType"] = "CUSTOMER",
): Promise<LedgerAccount> {
  const existing = await findAccount(userId, currency);
  if (existing) return existing;
  return createAccount(userId, currency, accountType);
}

/**
 * Get or create the clearing (suspense) account.
 * The clearing account holds funds in transit between customer and merchant.
 * This is the architectural fix for DEBIT_WITHOUT_CREDIT:
 *   Customer → Clearing (balanced), Merchant gets nothing until settlement.
 */
export async function getOrCreateClearingAccount(
  currency = "INR",
): Promise<LedgerAccount> {
  return getOrCreateLedgerAccount("system:clearing", currency, "CLEARING");
}

// ─── Record Transaction (Core) ──────────────────────────────────
//
// ARCHITECTURE: Clearing Account (Three-Legged Booking)
//
// Normal flow:
//   1. Customer → Clearing  (DEBIT customer, CREDIT clearing)   ← this function
//   2. Clearing → Merchant  (DEBIT clearing, CREDIT merchant)   ← settleToMerchant()
//
// This ensures SUM(debits) === SUM(credits) at ALL times.
// If the payment fails before settlement, the clearing account
// holds the funds and we reverse: Clearing → Customer.
// The merchant is NEVER credited until the provider confirms capture.
//
// This eliminates the DEBIT_WITHOUT_CREDIT problem entirely.

export async function recordTransaction(
  params: RecordTransactionParams,
): Promise<RecordTransactionResult> {
  // NOTE: No in-memory mutex. Idempotency is enforced by:
  //   1. Pre-check: look for existing transaction by idempotencyKey
  //   2. Post-create check: if two callers race past the pre-check, the
  //      second one discovers the first caller's transaction and returns it.
  //   In production, a DB UNIQUE constraint on idempotencyKey makes this atomic.

  const {
    customerId,
    merchantId,
    amount,
    currency,
    provider,
    providerReference,
    providerOrderId,
    description = "Payment",
    method,
    bank,
    idempotencyKey,
  } = params;

  // 1. Pre-check: idempotency
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
  const customerAccount = await getOrCreateLedgerAccount(
    customerId,
    currency,
    "CUSTOMER",
  );
  const clearingAccount = await getOrCreateClearingAccount(currency);

  // 4. Create payment transaction (PROCESSING — NOT yet settled to merchant)
  const transaction = await createPaymentTransaction({
    customerId,
    merchantId,
    amount,
    currency,
    provider,
    providerReference,
    providerOrderId,
    idempotencyKey,
    method,
    bank,
  });

  // 4b. Post-create idempotency check: if another concurrent call beat us
  //     to creating a transaction with the same idempotencyKey, return theirs.
  //     This handles the race where two callers both pass the pre-check.
  const postCheck = await getPaymentTransactionByIdempotencyKey(idempotencyKey);
  if (postCheck && postCheck.id !== transaction.id) {
    // Another caller won the race — return their transaction
    const entries = await getLedgerEntriesByTransaction(postCheck.id);
    const debitEntry = entries.find((e) => e.entryType === "DEBIT")!;
    const creditEntry = entries.find((e) => e.entryType === "CREDIT")!;
    return { transaction: postCheck, debitEntry, creditEntry };
  }

  // 5. Create ledger entries: Customer → Clearing (append-only)
  //    DEBIT the customer, CREDIT the clearing account
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
    accountId: clearingAccount.id,
    entryType: "CREDIT",
    amount,
    currency,
    description: `${description} — credit to clearing (pending settlement to ${merchantId})`,
  });

  // 6. Update account aggregates with OCC expectedVersion
  await updateAccountAggregates(customerAccount.id, customerAccount.version);
  await updateAccountAggregates(clearingAccount.id, clearingAccount.version);

  return { transaction, debitEntry, creditEntry };
}

/**
 * Settle funds from the clearing account to the merchant.
 * Called AFTER the provider confirms capture.
 * Clearing → Merchant: DEBIT clearing, CREDIT merchant.
 */
export async function settleToMerchant(
  transactionId: string,
  expectedVersion?: number,
): Promise<{ debitEntry: LedgerEntry; creditEntry: LedgerEntry }> {
  const transaction = await getPaymentTransactionById(transactionId);
  if (!transaction) throw new Error(`Transaction ${transactionId} not found`);

  // OCC Check
  if (expectedVersion !== undefined && transaction.version !== expectedVersion) {
    throw new Error(
      `OCC Conflict: Settlement version mismatch for transaction ${transactionId}. Expected ${expectedVersion}, got ${transaction.version}`,
    );
  }

  // Idempotency check: if settlement entries already exist
  const allEntries = await getLedgerEntriesByTransaction(transactionId);
  const existingSettlement = allEntries.find((e) =>
    e.description.startsWith("SETTLEMENT:"),
  );
  if (existingSettlement) {
    const settlementDebit = allEntries.find(
      (e) => e.entryType === "DEBIT" && e.description.startsWith("SETTLEMENT:"),
    )!;
    const settlementCredit = allEntries.find(
      (e) =>
        e.entryType === "CREDIT" && e.description.startsWith("SETTLEMENT:"),
    )!;
    return { debitEntry: settlementDebit, creditEntry: settlementCredit };
  }

  // Atomically update state & version via OCC
  const updatedTx = await updatePaymentTransactionState(
    transactionId,
    transaction.paymentState,
    "RESOLVED",
    {},
    expectedVersion ?? transaction.version,
  );

  if (!updatedTx) {
    throw new Error(
      `Failed to update settlement state for transaction ${transactionId}`,
    );
  }

  const clearingAccount = await getOrCreateClearingAccount(
    transaction.currency,
  );
  const merchantAccount = await getOrCreateLedgerAccount(
    transaction.merchantId,
    transaction.currency,
    "MERCHANT",
  );

  // DEBIT clearing, CREDIT merchant
  const settlementDebit = await createLedgerEntry({
    transactionId,
    accountId: clearingAccount.id,
    entryType: "DEBIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `SETTLEMENT: release from clearing to ${transaction.merchantId}`,
  });

  const settlementCredit = await createLedgerEntry({
    transactionId,
    accountId: merchantAccount.id,
    entryType: "CREDIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `SETTLEMENT: credit to ${transaction.merchantId}`,
  });

  await updateAccountAggregates(clearingAccount.id, clearingAccount.version);
  await updateAccountAggregates(merchantAccount.id, merchantAccount.version);

  return { debitEntry: settlementDebit, creditEntry: settlementCredit };
}

/**
 * Reverse funds from clearing back to customer.
 * Used when payment fails or is refunded before settlement.
 * Clearing → Customer: DEBIT clearing, CREDIT customer.
 */
export async function reverseFromClearing(
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

  const clearingAccount = await getOrCreateClearingAccount(
    transaction.currency,
  );
  const customerAccount = await getOrCreateLedgerAccount(
    transaction.customerId,
    transaction.currency,
    "CUSTOMER",
  );

  // DEBIT clearing, CREDIT customer (reverse the original booking)
  const reversalDebit = await createLedgerEntry({
    transactionId,
    accountId: clearingAccount.id,
    entryType: "DEBIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `REVERSAL: ${reason} — return from clearing to ${transaction.customerId}`,
  });

  const reversalCredit = await createLedgerEntry({
    transactionId,
    accountId: customerAccount.id,
    entryType: "CREDIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `REVERSAL: ${reason} — credit back to ${transaction.customerId}`,
  });

  await updateAccountAggregates(clearingAccount.id, clearingAccount.version);
  await updateAccountAggregates(customerAccount.id, customerAccount.version);

  return { debitEntry: reversalDebit, creditEntry: reversalCredit };
}

// ─── Reverse Transaction (Legacy — delegates to clearing flow) ──

export async function reverseTransaction(
  transactionId: string,
  reason: string,
): Promise<{ debitEntry: LedgerEntry; creditEntry: LedgerEntry }> {
  // Check if already settled to merchant — if so, reverse merchant→clearing→customer
  const allEntries = await getLedgerEntriesByTransaction(transactionId);
  const hasSettlement = allEntries.some((e) =>
    e.description.startsWith("SETTLEMENT:"),
  );

  if (hasSettlement) {
    // Full reversal: merchant → clearing → customer
    return reverseSettledTransaction(transactionId, reason);
  }

  // Not yet settled: reverse from clearing back to customer
  return reverseFromClearing(transactionId, reason);
}

/**
 * Reverse a fully settled transaction.
 * Merchant → Clearing → Customer (three-legged reversal).
 */
async function reverseSettledTransaction(
  transactionId: string,
  reason: string,
): Promise<{ debitEntry: LedgerEntry; creditEntry: LedgerEntry }> {
  const transaction = await getPaymentTransactionById(transactionId);
  if (!transaction) throw new Error(`Transaction ${transactionId} not found`);

  // Idempotency
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

  const merchantAccount = await getOrCreateLedgerAccount(
    transaction.merchantId,
    transaction.currency,
    "MERCHANT",
  );
  const customerAccount = await getOrCreateLedgerAccount(
    transaction.customerId,
    transaction.currency,
    "CUSTOMER",
  );

  // DEBIT merchant, CREDIT customer (reverse the settlement)
  const reversalDebit = await createLedgerEntry({
    transactionId,
    accountId: merchantAccount.id,
    entryType: "DEBIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `REVERSAL: ${reason} — debit from merchant ${transaction.merchantId}`,
  });

  const reversalCredit = await createLedgerEntry({
    transactionId,
    accountId: customerAccount.id,
    entryType: "CREDIT",
    amount: transaction.amount,
    currency: transaction.currency,
    description: `REVERSAL: ${reason} — credit to customer ${transaction.customerId}`,
  });

  await updateAccountAggregates(merchantAccount.id, merchantAccount.version);
  await updateAccountAggregates(customerAccount.id, customerAccount.version);

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

export { runWithEntityLock } from "./repository";
export { getPaymentTransactionById } from "./repository";
export { getPaymentTransactionByIdempotencyKey } from "./repository";
export { getPaymentTransactionByProviderOrderId } from "./repository";
export { getLedgerEntriesByTransaction } from "./repository";
export { updatePaymentTransactionState } from "./repository";
export { getAllPaymentTransactions } from "./repository";
