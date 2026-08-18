/**
 * BankVerse — Transaction Log Ingestion Types
 *
 * Defines canonical schemas for log entries, the 9 chaos/fault categories,
 * auto-solve policies, and batch ingestion.
 */

export type ChaosCategory =
  | "provider-timeout"
  | "amount-mismatch"
  | "duplicate-charge"
  | "missing-credit"
  | "webhook-out-of-order"
  | "provider-down"
  | "slow-reconciliation"
  | "worker-crash-after-commit"
  | "refund-race-condition";

export type LogSource =
  | "razorpay"
  | "dwolla"
  | "plaid"
  | "bank-statement"
  | "merchant"
  | "system"
  | string;

export type SourceType =
  | "PROVIDER_FEED"
  | "BANK_STATEMENT"
  | "WEBHOOK"
  | "MERCHANT"
  | "INTERNAL"
  | "MANUAL";

export type IngestStatus =
  | "ACCEPTED"
  | "DUPLICATE"
  | "REJECTED_VALIDATION"
  | "REJECTED_INTEGRITY";

export type ResolutionStatus =
  | "AUTO_SOLVED"
  | "UNRESOLVED"
  | "MANUAL_SOLVED"
  | "NOT_REQUIRED";

export interface TransactionLog {
  id: string;
  source: LogSource;
  sourceType: SourceType;
  externalRef: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  eventType: string;
  category: ChaosCategory;
  categoryName: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  amount: number;
  currency: string;
  direction: "DEBIT" | "CREDIT";
  timestamp: string;
  ingestedAt: string;
  rawPayload: Record<string, unknown> | string;
  dedupeHash: string;
  ingestStatus: IngestStatus;
  resolutionStatus: ResolutionStatus;
  resolutionDetails?: string;
  matchedTransactionId?: string;
}

export interface AutoSolvePolicy {
  categoryId: ChaosCategory;
  categoryName: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  enabled: boolean;
  description: string;
  remediationAction: string;
  updatedAt?: string;
}

export interface IngestBatchRequest {
  source?: LogSource;
  sourceType?: SourceType;
  rawFormat?: "JSON" | "CSV";
  payload: string | Record<string, unknown>[];
}

export interface IngestResult {
  batchId: string;
  processedAt: string;
  total: number;
  accepted: number;
  autoSolved: number;
  unresolved: number;
  duplicates: number;
  rejected: number;
  logs: TransactionLog[];
}

export interface LogFilterParams {
  category?: ChaosCategory;
  source?: string;
  resolutionStatus?: ResolutionStatus;
  search?: string;
  page?: number;
  limit?: number;
}
