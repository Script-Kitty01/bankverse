/**
 * BankVerse — Financial Ledger Type Definitions
 *
 * Double-entry ledger types inspired by Blnk.
 * All monetary values are in the smallest currency unit (e.g., paise for INR).
 */

// ─── Ledger Entry ───────────────────────────────────────────────

export type LedgerEntryType = "DEBIT" | "CREDIT";

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  entryType: LedgerEntryType;
  amount: number;
  currency: string;
  description: string;
  createdAt: string;
}

// ─── Ledger Account ─────────────────────────────────────────────

export interface LedgerAccount {
  id: string;
  userId: string;
  currency: string;
  /** Sum of all DEBIT entries for this account */
  totalDebits: number;
  /** Sum of all CREDIT entries for this account */
  totalCredits: number;
  /** Derived balance: totalCredits - totalDebits */
  derivedBalance: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Payment Transaction ────────────────────────────────────────

export type PaymentState =
  | "CREATED"
  | "PROCESSING"
  | "SUCCESS"
  | "FAILED"
  | "UNKNOWN";

export type SettlementState =
  | "NOT_REQUIRED"
  | "PENDING_RECONCILIATION"
  | "RECONCILING"
  | "REFUND_PENDING"
  | "REFUNDED"
  | "RESOLVED"
  | "ESCALATED";

export interface PaymentTransaction {
  id: string;
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  paymentState: PaymentState;
  settlementState: SettlementState;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Record Transaction Params ──────────────────────────────────

export interface RecordTransactionParams {
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  provider: string;
  providerReference: string;
  idempotencyKey: string;
  description?: string;
}

export interface RecordTransactionResult {
  transaction: PaymentTransaction;
  debitEntry: LedgerEntry;
  creditEntry: LedgerEntry;
}
