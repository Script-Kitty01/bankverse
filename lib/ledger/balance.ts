/**
 * BankVerse — Ledger Balance
 *
 * Balances are derived from entries, never stored as mutable fields.
 * The stored aggregates (totalDebits, totalCredits, derivedBalance) are
 * a cache — the source of truth is always the entry list.
 */

import type { LedgerEntry } from "./types";

export interface BalanceSnapshot {
  totalDebits: number;
  totalCredits: number;
  derivedBalance: number;
}

/**
 * Compute balance from a list of ledger entries.
 * derivedBalance = totalCredits - totalDebits
 * (Credits increase balance, debits decrease it)
 */
export function computeBalance(entries: LedgerEntry[]): BalanceSnapshot {
  const totalDebits = entries
    .filter((e) => e.entryType === "DEBIT")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalCredits = entries
    .filter((e) => e.entryType === "CREDIT")
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    totalDebits,
    totalCredits,
    derivedBalance: totalCredits - totalDebits,
  };
}

/**
 * Compute balance for a specific account from all entries.
 */
export function computeAccountBalance(
  entries: LedgerEntry[],
  accountId: string,
): BalanceSnapshot {
  return computeBalance(entries.filter((e) => e.accountId === accountId));
}

/**
 * Returns a zero balance snapshot.
 */
export function zeroBalance(): BalanceSnapshot {
  return { totalDebits: 0, totalCredits: 0, derivedBalance: 0 };
}
