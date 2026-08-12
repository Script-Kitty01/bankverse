/**
 * BankVerse — Reconciliation Type Definitions
 *
 * Reconciliation matches internal ledger entries against external
 * provider records (Razorpay settlements, bank statements, etc.)
 * to detect discrepancies.
 */

// ─── Match Status ───────────────────────────────────────────────

export type MatchStatus = "MATCHED" | "MISMATCHED" | "UNMATCHED" | "PENDING";

export type MismatchType =
  | "AMOUNT_MISMATCH"
  | "MISSING_INTERNAL"
  | "MISSING_EXTERNAL"
  | "DUPLICATE"
  | "TIMING_DIFFERENCE"
  | "CURRENCY_MISMATCH"
  | "UNKNOWN";

export type MatchMethod = "EXACT" | "FUZZY" | "MANUAL";

// ─── Reconciliation Run ─────────────────────────────────────────

export interface ReconciliationRun {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  totalItems: number;
  matchedItems: number;
  mismatchedItems: number;
  unmatchedItems: number;
  provider: string;
  dateRange: {
    start: string;
    end: string;
  };
  createdBy: string; // "system" or "manual"
}

// ─── Reconciliation Item ────────────────────────────────────────

export interface ReconciliationItem {
  id: string;
  runId: string;
  internalTransactionId: string;
  externalReference: string;
  internalAmount: number;
  externalAmount: number;
  internalCurrency: string;
  externalCurrency: string;
  matchStatus: MatchStatus;
  mismatchType?: MismatchType;
  matchMethod: MatchMethod;
  difference: number; // internalAmount - externalAmount
  notes?: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ─── Reconciliation Evidence ────────────────────────────────────

export interface ReconciliationEvidence {
  itemId: string;
  internalEntry: {
    transactionId: string;
    amount: number;
    currency: string;
    timestamp: string;
  };
  externalRecord: {
    reference: string;
    amount: number;
    currency: string;
    timestamp: string;
    status: string;
  };
  matchResult: {
    status: MatchStatus;
    mismatchType?: MismatchType;
    method: MatchMethod;
    confidence: number; // 0-1
  };
}

// ─── External Record (Provider-side) ────────────────────────────

export interface ExternalRecord {
  reference: string;
  amount: number;
  currency: string;
  timestamp: string;
  status: string;
  description?: string;
  metadata?: Record<string, string>;
}

// ─── Reconciliation Report ──────────────────────────────────────

export interface ReconciliationReport {
  run: ReconciliationRun;
  items: ReconciliationItem[];
  summary: {
    totalAmountInternal: number;
    totalAmountExternal: number;
    netDifference: number;
    matchRate: number; // 0-1
    criticalItems: number; // mismatches > threshold
  };
  generatedAt: string;
}
