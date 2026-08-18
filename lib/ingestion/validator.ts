/**
 * BankVerse — Transaction Ingestion Validator
 *
 * Validates raw and normalized transaction candidates against mandatory business invariants:
 * 1. Non-empty reference / transaction ID
 * 2. Valid positive numeric amount (> 0 and not NaN / Infinity)
 * 3. Valid 3-letter currency code (e.g. INR, USD, EUR)
 * 4. Valid parseable ISO 8601 timestamp
 * 5. Valid direction (DEBIT or CREDIT)
 * 6. Valid status (SUCCESS, PENDING, FAILED, REFUNDED, SETTLED)
 */

import type {
  NormalizedTransaction,
  RawRowItem,
  TransactionSourceType,
} from "./normalized-types";
import { normalizeRawRow } from "./normalizer";

export interface ValidationRuleResult {
  isValid: boolean;
  errors: string[];
}

export const VALID_CURRENCIES = new Set([
  "INR",
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "SGD",
  "AED",
  "CHF",
]);

/**
 * Validates a normalized transaction object.
 */
export function validateTransaction(
  tx: Omit<NormalizedTransaction, "validationStatus" | "validationErrors">,
): NormalizedTransaction {
  const errors: string[] = [];

  // 1. Reference check
  if (!tx.reference || tx.reference.trim().length === 0) {
    errors.push("Missing or empty transaction reference identifier");
  }

  // 2. Amount check
  if (typeof tx.amount !== "number" || isNaN(tx.amount) || !isFinite(tx.amount)) {
    errors.push(`Invalid numeric amount: received ${String(tx.amount)}`);
  } else if (tx.amount <= 0) {
    errors.push(`Non-positive amount: ${tx.amount} (must be > 0)`);
  }

  // 3. Currency check
  if (!tx.currency || typeof tx.currency !== "string") {
    errors.push("Missing currency code");
  } else if (!/^[A-Z]{3}$/.test(tx.currency.toUpperCase())) {
    errors.push(`Invalid currency format '${tx.currency}' (expected 3-letter ISO code)`);
  }

  // 4. Timestamp check
  if (!tx.timestamp) {
    errors.push("Missing transaction timestamp");
  } else {
    const tMs = new Date(tx.timestamp).getTime();
    if (isNaN(tMs)) {
      errors.push(`Unparseable timestamp date format: '${tx.timestamp}'`);
    }
  }

  // 5. Direction check
  if (tx.direction !== "DEBIT" && tx.direction !== "CREDIT") {
    errors.push(`Invalid transaction direction '${String(tx.direction)}' (must be DEBIT or CREDIT)`);
  }

  // 6. Status check
  const validStatuses = ["SUCCESS", "PENDING", "FAILED", "REFUNDED", "SETTLED"];
  if (!validStatuses.includes(tx.status)) {
    errors.push(`Invalid status '${String(tx.status)}'`);
  }

  const isMalformed = errors.length > 0;

  return {
    ...tx,
    validationStatus: isMalformed ? "MALFORMED" : "VALID",
    validationErrors: errors,
  };
}

/**
 * Normalizes and validates a raw row item in a single step.
 */
export function validateAndNormalizeRow(
  rawRow: RawRowItem,
  defaultSource = "bank-statement",
  defaultSourceType: TransactionSourceType = "BANK_STATEMENT",
): NormalizedTransaction {
  const candidate = normalizeRawRow(rawRow, defaultSource, defaultSourceType);
  return validateTransaction(candidate);
}
