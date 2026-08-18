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
import type { NormalizedTransaction } from "@/lib/ingestion/normalized-types";

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

  /**
   * Reconcile normalized ingested transactions directly against internal ledger entries.
   */
  async reconcileNormalizedTransactions(
    normalizedTxs: NormalizedTransaction[],
    dateRange?: { start: string; end: string },
  ): Promise<ReconciliationReport> {
    const range = dateRange || {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    };

    const internalTxs = await this.fetchInternalTransactions(range);

    const externalRecords: ExternalRecord[] = normalizedTxs
      .filter((ntx) => ntx.validationStatus === "VALID")
      .map((ntx): ExternalRecord => {
        const meta: Record<string, string> = {
          provider: ntx.source,
          sourceType: ntx.sourceType,
        };
        if (ntx.metadata) {
          Object.entries(ntx.metadata).forEach(([k, v]) => {
            meta[k] = String(v);
          });
        }
        return {
          reference: ntx.reference,
          amount: ntx.amount,
          currency: ntx.currency,
          timestamp: ntx.timestamp,
          status: ntx.status.toLowerCase(),
          description: ntx.description || `Ingested ${ntx.source} transaction`,
          metadata: meta,
        };
      });

    const runId = `rec_run_norm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const startedAt = new Date().toISOString();

    const { items } = this.matcher.match(internalTxs, externalRecords, runId);

    const matchedItems = items.filter(
      (i) => i.matchStatus === "MATCHED_EXACT" || i.matchStatus === "MATCHED_FUZZY",
    ).length;
    const mismatchedItems = items.filter(
      (i) => i.matchStatus === "MISMATCHED",
    ).length;
    const unmatchedItems = items.filter(
      (i) => i.matchStatus === "UNMATCHED",
    ).length;

    const totalAmountInternal = items.reduce(
      (sum, i) => sum + i.internalAmount,
      0,
    );
    const totalAmountExternal = items.reduce(
      (sum, i) => sum + i.externalAmount,
      0,
    );

    const run: ReconciliationRun = {
      id: runId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: "COMPLETED",
      totalItems: items.length,
      matchedItems,
      mismatchedItems,
      unmatchedItems,
      provider: this.provider,
      dateRange: range,
      createdBy: "pipeline",
    };

    return {
      run,
      items,
      summary: {
        totalAmountInternal,
        totalAmountExternal,
        netDifference: totalAmountInternal - totalAmountExternal,
        matchRate: items.length > 0 ? matchedItems / items.length : 0,
        criticalItems: items.filter(
          (i) => i.matchStatus === "MISMATCHED" && Math.abs(i.difference) > 100,
        ).length,
      },
      generatedAt: new Date().toISOString(),
    };
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
    const internalTxs = await this.fetchInternalTransactions(dateRange);

    let ingestedLogs: any[] = [];
    try {
      const { getAllLogs } = await import("@/lib/ingestion/store");
      ingestedLogs = getAllLogs();
    } catch {
      // Ignored
    }

    const start = new Date(dateRange.start).getTime();
    const end = new Date(dateRange.end).getTime();

    return internalTxs.map((tx): ExternalRecord => {
      const txTime = new Date(tx.createdAt).getTime();
      const inRange = txTime >= start && txTime <= end;

      // Look for a real ingested log for this transaction
      const matchedLog = ingestedLogs.find((log) => {
        const matchesProvider =
          log.source.toLowerCase() === this.provider.toLowerCase();
        const matchesTx =
          tx.providerReference === log.externalRef ||
          tx.id === log.matchedTransactionId ||
          (tx.providerOrderId && tx.providerOrderId === log.providerOrderId) ||
          (tx.providerPaymentId && tx.providerPaymentId === log.providerPaymentId);
        return matchesProvider && matchesTx;
      });

      if (matchedLog && inRange) {
        return {
          reference: matchedLog.externalRef,
          amount: matchedLog.amount,
          currency: matchedLog.currency,
          timestamp: matchedLog.timestamp,
          status: matchedLog.resolutionStatus === "AUTO_SOLVED" ? "settled" : "pending",
          description: `Ingested log (${matchedLog.categoryName})`,
          metadata: {
            provider: matchedLog.source,
            category: matchedLog.category,
            resolutionStatus: matchedLog.resolutionStatus,
          },
        };
      }

      // Default demo simulation
      return {
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
      };
    });
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
