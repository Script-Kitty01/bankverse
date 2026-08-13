/**
 * BankVerse — Ledger Validation
 *
 * Invariants enforced at transaction time:
 * 1. SUM(debits) === SUM(credits) — the fundamental double-entry rule
 * 2. Amount > 0 — no zero or negative transactions
 * 3. Idempotency — duplicate keys return the existing transaction
 */

import type { LedgerEntry } from "./types";

/**
 * Validates that total debits equal total credits for a set of entries.
 * This is the core double-entry invariant.
 */
export function validateDoubleEntry(
  entries: { entryType: "DEBIT" | "CREDIT"; amount: number }[],
): {
  valid: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
} {
  const totalDebits = entries
    .filter((e) => e.entryType === "DEBIT")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalCredits = entries
    .filter((e) => e.entryType === "CREDIT")
    .reduce((sum, e) => sum + e.amount, 0);

  const diff = Math.abs(totalDebits - totalCredits);

  return {
    valid: diff < 0.0001,
    totalDebits,
    totalCredits,
    difference: totalDebits - totalCredits,
  };
}

/**
 * Validates a simple payment: one debit + one credit of equal amount.
 * Throws on failure so the caller gets a clear error.
 */
export function validatePaymentEntries(
  debitAmount: number,
  creditAmount: number,
): void {
  if (debitAmount <= 0) {
    throw new Error(
      `Ledger validation failed: debit amount must be > 0, got ${debitAmount}`,
    );
  }
  if (creditAmount <= 0) {
    throw new Error(
      `Ledger validation failed: credit amount must be > 0, got ${creditAmount}`,
    );
  }
  if (Math.abs(debitAmount - creditAmount) >= 0.0001) {
    throw new Error(
      `Ledger validation failed: SUM(debits)=${debitAmount} !== SUM(credits)=${creditAmount}`,
    );
  }
}

/**
 * Validates that a reversal has matching original entries.
 */
export function validateReversalEntries(
  originalEntries: LedgerEntry[],
  transactionId: string,
): { debit: LedgerEntry; credit: LedgerEntry } {
  const originalDebit = originalEntries.find((e) => e.entryType === "DEBIT");
  const originalCredit = originalEntries.find((e) => e.entryType === "CREDIT");

  if (!originalDebit || !originalCredit) {
    throw new Error(
      `Incomplete ledger entries for transaction ${transactionId}`,
    );
  }

  return { debit: originalDebit, credit: originalCredit };
}

/**
 * Verifies global ledger integrity: SUM(all debits) === SUM(all credits).
 */
export function verifyLedgerIntegrity(entries: LedgerEntry[]): {
  valid: boolean;
  totalDebits: number;
  totalCredits: number;
  difference: number;
} {
  return validateDoubleEntry(entries);
}
