/**
 * BankVerse — Reconciliation Engine
 *
 * Orchestrates reconciliation runs:
 * 1. Fetch internal transactions for a date range
 * 2. Fetch external records from provider
 * 3. Run the matcher
 * 4. Generate a reconciliation report
 */

import { ReconciliationMatcher } from "./matcher";
import type { MatcherConfig } from "./matcher";
import type {
  ReconciliationRun,
  ReconciliationReport,
  ExternalRecord,
} from "./types";
import { getAllPaymentTransactions } from "@/lib/ledger/ledger.service";
import type { PaymentTransaction } from "@/lib/ledger/types";

// ─── Config ─────────────────────────────────────────────────────

export interface ReconciliationEngineConfig {
  matcherConfig?: Partial<MatcherConfig>;
  /** Provider name for fetching external records */
  provider: string;
}

// ─── Engine ─────────────────────────────────────────────────────

export class ReconciliationEngine {
  private matcher: ReconciliationMatcher;
  private provider: string;

  constructor(config: ReconciliationEngineConfig) {
    this.matcher = new ReconciliationMatcher(config.matcherConfig);
    this.provider = config.provider;
  }

  /**
   * Run a full reconciliation for a date range.
   */
  async runReconciliation(dateRange: {
    start: string;
    end: string;
  }): Promise<ReconciliationReport> {
    const runId = `rec_run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = new Date().toISOString();

    const run: ReconciliationRun = {
      id: runId,
      startedAt,
      status: "RUNNING",
      totalItems: 0,
      matchedItems: 0,
      mismatchedItems: 0,
      unmatchedItems: 0,
      provider: this.provider,
      dateRange,
      createdBy: "system",
    };

    try {
      // 1. Fetch internal transactions
      const internalTransactions =
        await this.fetchInternalTransactions(dateRange);

      // 2. Fetch external records
      const externalRecords = await this.fetchExternalRecords(dateRange);

      // 3. Run matcher
      const { items } = this.matcher.match(
        internalTransactions,
        externalRecords,
        runId,
      );

      // 4. Compute summary
      run.totalItems = items.length;
      run.matchedItems = items.filter(
        (i) =>
          i.matchStatus === "MATCHED_EXACT" ||
          i.matchStatus === "MATCHED_FUZZY",
      ).length;
      run.mismatchedItems = items.filter(
        (i) => i.matchStatus === "MISMATCHED",
      ).length;
      run.unmatchedItems = items.filter(
        (i) => i.matchStatus === "UNMATCHED",
      ).length;
      run.status = "COMPLETED";
      run.completedAt = new Date().toISOString();

      const totalAmountInternal = items.reduce(
        (sum, i) => sum + i.internalAmount,
        0,
      );
      const totalAmountExternal = items.reduce(
        (sum, i) => sum + i.externalAmount,
        0,
      );

      return {
        run,
        items,
        summary: {
          totalAmountInternal,
          totalAmountExternal,
          netDifference: totalAmountInternal - totalAmountExternal,
          matchRate: run.totalItems > 0 ? run.matchedItems / run.totalItems : 0,
          criticalItems: items.filter(
            (i) =>
              i.matchStatus === "MISMATCHED" && Math.abs(i.difference) > 100,
          ).length,
        },
        generatedAt: new Date().toISOString(),
      };
    } catch {
      run.status = "FAILED";
      run.completedAt = new Date().toISOString();

      return {
        run,
        items: [],
        summary: {
          totalAmountInternal: 0,
          totalAmountExternal: 0,
          netDifference: 0,
          matchRate: 0,
          criticalItems: 0,
        },
        generatedAt: new Date().toISOString(),
      };
    }
  }

  // ─── Private ──────────────────────────────────────────────────

  private async fetchInternalTransactions(dateRange: {
    start: string;
    end: string;
  }): Promise<PaymentTransaction[]> {
    // Fetch with a generous limit; reconciliation runs are typically
    // scoped to a date range so the full set should be manageable.
    const MAX_TRANSACTIONS = 10_000;
    const allTransactions = await getAllPaymentTransactions(MAX_TRANSACTIONS);

    if (allTransactions.length >= MAX_TRANSACTIONS) {
      console.warn(
        `[ReconciliationEngine] fetchInternalTransactions hit limit of ${MAX_TRANSACTIONS}. ` +
          `Results may be incomplete. Consider paginating getAllPaymentTransactions.`,
      );
    }

    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime();

    return allTransactions.filter((tx) => {
      const txTime = new Date(tx.createdAt).getTime();
      return txTime >= start && txTime <= end;
    });
  }

  private async fetchExternalRecords(dateRange: {
    start: string;
    end: string;
  }): Promise<ExternalRecord[]> {
    // In demo mode or unconfigured provider environments, generate simulated external records from internal transactions
    if (
      process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
      !process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID === "rzp_test_demo123"
    ) {
      const internalTxs = await this.fetchInternalTransactions(dateRange);

      return internalTxs.map((tx) => ({
        reference: tx.providerReference,
        amount: tx.amount,
        currency: tx.currency,
        timestamp: tx.createdAt,
        status: tx.paymentState === "SUCCESS" ? "settled" : "pending",
        description: `External settlement for ${tx.id}`,
        metadata: {
          provider: this.provider,
          internalId: tx.id,
        },
      }));
    }

    // Production: fetch from provider API
    // This would call Razorpay's settlement API, bank statement API, etc.
    throw new Error(
      `[ReconciliationEngine] External record fetching is not implemented for provider "${this.provider}". ` +
        `Reconciliation cannot proceed without external data. ` +
        `Implement fetchExternalRecords for this provider or run in demo mode.`,
    );
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let engineInstance: ReconciliationEngine | null = null;

export function getReconciliationEngine(
  config?: ReconciliationEngineConfig,
): ReconciliationEngine {
  if (!engineInstance) {
    engineInstance = new ReconciliationEngine(
      config || { provider: "razorpay" },
    );
  } else if (config) {
    console.warn(
      "[ReconciliationEngine] Config provided but singleton already exists. " +
        "Config is ignored. Call resetReconciliationEngine() first if you need to change config.",
    );
  }
  return engineInstance;
}

/** Reset singleton (useful for testing with different configs). */
export function resetReconciliationEngine(): void {
  engineInstance = null;
}
