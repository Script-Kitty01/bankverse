/**
 * BankVerse — Normalized Transaction Pipeline Types
 *
 * Unified schema for ingested financial transactions across diverse
 * external providers (Razorpay, Stripe, Plaid), bank statements, and internal exports.
 */

export type TransactionSourceType =
  | "INTERNAL"
  | "EXTERNAL_PROVIDER"
  | "BANK_STATEMENT"
  | "WEBHOOK"
  | "MANUAL";

export type NormalizedStatus =
  | "SUCCESS"
  | "PENDING"
  | "FAILED"
  | "REFUNDED"
  | "SETTLED";

export type NormalizedDirection = "DEBIT" | "CREDIT";

export type ValidationStatus = "VALID" | "MALFORMED";

export interface NormalizedTransaction {
  /** Unique normalized transaction ID */
  id: string;
  /** Name of the provider/source (e.g., "razorpay", "bank-statement", "stripe", "plaid", "internal") */
  source: string;
  /** High-level category of source feed */
  sourceType: TransactionSourceType;
  /** External/Provider/Bank transaction reference ID */
  reference: string;
  /** Associated provider order ID if available */
  providerOrderId?: string;
  /** Associated provider payment ID if available */
  providerPaymentId?: string;
  /** Normalized positive numeric transaction amount */
  amount: number;
  /** 3-letter ISO currency code (e.g., "INR", "USD") */
  currency: string;
  /** Direction of money movement relative to the account */
  direction: NormalizedDirection;
  /** Normalized status */
  status: NormalizedStatus;
  /** ISO 8601 UTC timestamp string */
  timestamp: string;
  /** Optional human-readable description or remarks */
  description?: string;
  /** Additional provider metadata key-value pairs */
  metadata?: Record<string, string | number | boolean>;
  /** Unaltered original payload for auditability */
  rawPayload?: Record<string, unknown> | string;
  /** Validation status flag */
  validationStatus: ValidationStatus;
  /** List of validation error messages if MALFORMED */
  validationErrors: string[];
}

export interface RawRowItem {
  [key: string]: unknown;
}

export interface MalformedRowReport {
  rowIndex: number;
  rawRow: RawRowItem | string;
  errors: string[];
}

export interface IngestionPipelineResult {
  batchId: string;
  processedAt: string;
  totalRows: number;
  validCount: number;
  malformedCount: number;
  transactions: NormalizedTransaction[];
  validTransactions: NormalizedTransaction[];
  malformedRows: MalformedRowReport[];
}
