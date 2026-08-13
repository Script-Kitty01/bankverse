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

export type LedgerAccountType = "CUSTOMER" | "MERCHANT" | "CLEARING";

export interface LedgerAccount {
  id: string;
  userId: string;
  currency: string;
  /** Account type: CUSTOMER, MERCHANT, or CLEARING (suspense account) */
  accountType: LedgerAccountType;
  /** Sum of all DEBIT entries for this account */
  totalDebits: number;
  /** Sum of all CREDIT entries for this account */
  totalCredits: number;
  /** Derived balance: totalCredits - totalDebits */
  derivedBalance: number;
  /** Entity version for Optimistic Concurrency Control (OCC) */
  version?: number;
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
  | "COMPENSATED"
  | "RESOLVED"
  | "ESCALATED";

export interface PaymentTransaction {
  id: string;
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  /** Payment method: upi, card, netbanking, ach, etc. */
  method?: string;
  /** Originating bank identifier, if known */
  bank?: string;
  paymentState: PaymentState;
  settlementState: SettlementState;
  provider: string;
  /** Provider's order ID (created at authorization time) */
  providerOrderId?: string;
  /** Provider's payment/capture ID (assigned after capture) */
  providerPaymentId?: string;
  /** Provider's refund ID (assigned after refund) */
  providerRefundId?: string;
  /** Legacy: first provider reference (order ID for backward compat) */
  providerReference: string;
  idempotencyKey: string;
  retryCount: number;
  /** Entity version for Optimistic Concurrency Control (OCC) */
  version?: number;
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
  providerOrderId?: string;
  idempotencyKey: string;
  description?: string;
  method?: string;
  bank?: string;
}

export interface RecordTransactionResult {
  transaction: PaymentTransaction;
  debitEntry: LedgerEntry;
  creditEntry: LedgerEntry;
}
