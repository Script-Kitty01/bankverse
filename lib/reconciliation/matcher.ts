/**
 * BankVerse — Reconciliation Matcher
 *
 * Matches internal ledger entries against external provider records.
 * Supports exact matching (by reference) and fuzzy matching (by amount + time window).
 */

import type {
  ReconciliationItem,
  ReconciliationEvidence,
  ExternalRecord,
  MatchStatus,
  MismatchType,
  MatchMethod,
} from "./types";
import type { PaymentTransaction } from "@/lib/ledger/types";

// ─── Config ─────────────────────────────────────────────────────

export interface MatcherConfig {
  /** Maximum amount difference for fuzzy match (in smallest currency unit) */
  amountTolerance: number;
  /** Time window for fuzzy matching (in milliseconds) */
  timeWindowMs: number;
  /** Minimum confidence for fuzzy match to be considered matched */
  minConfidence: number;
}

const DEFAULT_CONFIG: MatcherConfig = {
  amountTolerance: 0, // exact amount match by default
  timeWindowMs: 60 * 60 * 1000, // 1 hour (was 24h — too loose for financial reconciliation)
  minConfidence: 0.8,
};

// ─── Matcher ────────────────────────────────────────────────────

export class ReconciliationMatcher {
  private config: MatcherConfig;

  constructor(config?: Partial<MatcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Match internal transactions against external records.
   * Returns reconciliation items with match status.
   */
  match(
    internalTransactions: PaymentTransaction[],
    externalRecords: ExternalRecord[],
    runId: string,
  ): { items: ReconciliationItem[]; evidence: ReconciliationEvidence[] } {
    const items: ReconciliationItem[] = [];
    const matchedExternal = new Set<string>();

    for (const tx of internalTransactions) {
      // Try exact match by provider reference (or providerOrderId)
      const exactMatch = externalRecords.find(
        (ext) =>
          ext.reference === tx.providerReference ||
          ext.reference === tx.providerOrderId ||
          ext.reference === tx.providerPaymentId,
      );

      if (exactMatch) {
        matchedExternal.add(exactMatch.reference);
        const result = this.buildMatchResult(tx, exactMatch, "EXACT");
        items.push(this.buildItem(tx, exactMatch, runId, result));
        continue;
      }

      // Try fuzzy match by amount + time window + dimensions
      const fuzzyResult = this.findFuzzyMatch(
        tx,
        externalRecords,
        matchedExternal,
      );

      if (fuzzyResult.ambiguous) {
        // Multiple candidates with identical/similar confidence — flag as AMBIGUOUS_MATCH
        const ambiguousResult = {
          status: "AMBIGUOUS_MATCH" as MatchStatus,
          mismatchType: "AMBIGUOUS_CANDIDATES" as MismatchType,
          method: "MANUAL" as MatchMethod,
          confidence: 0,
        };
        const item = this.buildItem(tx, null, runId, ambiguousResult);
        item.notes = `AMBIGUOUS_MATCH: ${fuzzyResult.candidates.length} candidates with identical confidence found. Escalated to ACTION_REQUIRED for human review.`;
        items.push(item);
        continue;
      }

      if (fuzzyResult.match) {
        matchedExternal.add(fuzzyResult.match.reference);
        const result = this.buildMatchResult(tx, fuzzyResult.match, "FUZZY");
        items.push(this.buildItem(tx, fuzzyResult.match, runId, result));
        continue;
      }

      // Unmatched internal transaction
      const unmatchedResult = {
        status: "UNMATCHED" as MatchStatus,
        mismatchType: "MISSING_EXTERNAL" as MismatchType,
        method: "MANUAL" as MatchMethod,
        confidence: 0,
      };
      items.push(this.buildItem(tx, null, runId, unmatchedResult));
    }

    // External records not matched to any internal transaction
    for (const ext of externalRecords) {
      if (!matchedExternal.has(ext.reference)) {
        const unmatchedResult = {
          status: "UNMATCHED" as MatchStatus,
          mismatchType: "MISSING_INTERNAL" as MismatchType,
          method: "MANUAL" as MatchMethod,
          confidence: 0,
        };
        items.push(this.buildItem(null, ext, runId, unmatchedResult));
      }
    }

    // Build evidence from items (so itemId is properly set)
    const evidence: ReconciliationEvidence[] = items.map((item) => {
      const tx =
        internalTransactions.find((t) => t.id === item.internalTransactionId) ||
        null;
      const ext =
        externalRecords.find((e) => e.reference === item.externalReference) ||
        null;
      return this.buildEvidence(tx, ext, item.id, {
        status: item.matchStatus,
        mismatchType: item.mismatchType,
        method: item.matchMethod,
        confidence: 0,
      });
    });

    return { items, evidence };
  }

  // ─── Private Helpers ──────────────────────────────────────────

  private findFuzzyMatch(
    tx: PaymentTransaction,
    externalRecords: ExternalRecord[],
    matchedExternal: Set<string>,
  ): {
    match: ExternalRecord | null;
    ambiguous: boolean;
    candidates: ExternalRecord[];
  } {
    const txTime = new Date(tx.createdAt).getTime();
    const candidates: { ext: ExternalRecord; confidence: number }[] = [];

    for (const ext of externalRecords) {
      if (matchedExternal.has(ext.reference)) continue;

      const extTime = new Date(ext.timestamp).getTime();
      const timeDiff = Math.abs(txTime - extTime);

      if (timeDiff > this.config.timeWindowMs) continue;

      const amountDiff = Math.abs(tx.amount - ext.amount);
      if (amountDiff > this.config.amountTolerance) continue;

      // Multi-dimensional confidence scoring
      let dimensionBonus = 0;
      let dimensionCount = 0;

      // Amount proximity
      const amountConfidence =
        this.config.amountTolerance > 0
          ? 1 - amountDiff / this.config.amountTolerance
          : 1;
      dimensionBonus += amountConfidence;
      dimensionCount++;

      // Time proximity
      const timeConfidence = 1 - timeDiff / this.config.timeWindowMs;
      dimensionBonus += timeConfidence;
      dimensionCount++;

      // Currency match
      if (tx.currency === ext.currency) {
        dimensionBonus += 1;
        dimensionCount++;
      }

      // Method match (if available on both sides)
      if (tx.method && ext.method && tx.method === ext.method) {
        dimensionBonus += 1;
        dimensionCount++;
      }

      // Customer/merchant match (if external record has counterparty info)
      if (ext.counterpartyId) {
        if (
          ext.counterpartyId === tx.customerId ||
          ext.counterpartyId === tx.merchantId
        ) {
          dimensionBonus += 1;
          dimensionCount++;
        }
      }

      const confidence = dimensionBonus / dimensionCount;

      if (confidence >= this.config.minConfidence) {
        candidates.push({ ext, confidence });
      }
    }

    if (candidates.length === 0) {
      return { match: null, ambiguous: false, candidates: [] };
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);

    // Ambiguity detection: if top 2 candidates are within 0.1 confidence of each other
    if (
      candidates.length >= 2 &&
      candidates[0].confidence - candidates[1].confidence < 0.1
    ) {
      return {
        match: null,
        ambiguous: true,
        candidates: candidates.map((c) => c.ext),
      };
    }

    return {
      match: candidates[0].ext,
      ambiguous: false,
      candidates: candidates.map((c) => c.ext),
    };
  }

  private buildMatchResult(
    tx: PaymentTransaction | null,
    ext: ExternalRecord | null,
    method: MatchMethod,
  ): {
    status: MatchStatus;
    mismatchType?: MismatchType;
    method: MatchMethod;
    confidence: number;
  } {
    if (!tx || !ext) {
      return {
        status: "UNMATCHED",
        mismatchType: !tx ? "MISSING_INTERNAL" : "MISSING_EXTERNAL",
        method: "MANUAL",
        confidence: 0,
      };
    }

    // Check for mismatches
    // For EXACT matches (by reference), any amount difference is a mismatch.
    // For FUZZY matches, respect the configured amountTolerance.
    const amountDiff = Math.abs(tx.amount - ext.amount);
    const isAmountMismatch =
      method === "EXACT"
        ? amountDiff !== 0
        : amountDiff > this.config.amountTolerance;

    if (isAmountMismatch) {
      return {
        status: "MISMATCHED",
        mismatchType: "AMOUNT_MISMATCH",
        method,
        confidence: 0.5,
      };
    }

    if (tx.currency !== ext.currency) {
      return {
        status: "MISMATCHED",
        mismatchType: "CURRENCY_MISMATCH",
        method,
        confidence: 0.5,
      };
    }

    return {
      status: method === "EXACT" ? "MATCHED_EXACT" : "MATCHED_FUZZY",
      method,
      confidence: method === "EXACT" ? 1 : 0.9,
    };
  }

  private buildItem(
    tx: PaymentTransaction | null,
    ext: ExternalRecord | null,
    runId: string,
    result: {
      status: MatchStatus;
      mismatchType?: MismatchType;
      method: MatchMethod;
      confidence: number;
    },
  ): ReconciliationItem {
    return {
      id: `rec_item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      runId,
      internalTransactionId: tx?.id || "N/A",
      externalReference: ext?.reference || "N/A",
      internalAmount: tx?.amount || 0,
      externalAmount: ext?.amount || 0,
      internalCurrency: tx?.currency || "N/A",
      externalCurrency: ext?.currency || "N/A",
      matchStatus: result.status,
      mismatchType: result.mismatchType,
      matchMethod: result.method,
      difference: (tx?.amount || 0) - (ext?.amount || 0),
    };
  }

  private buildEvidence(
    tx: PaymentTransaction | null,
    ext: ExternalRecord | null,
    itemId: string,
    result: {
      status: MatchStatus;
      mismatchType?: MismatchType;
      method: MatchMethod;
      confidence: number;
    },
  ): ReconciliationEvidence {
    return {
      itemId,
      internalEntry: tx
        ? {
            transactionId: tx.id,
            amount: tx.amount,
            currency: tx.currency,
            timestamp: tx.createdAt,
          }
        : {
            transactionId: "N/A",
            amount: 0,
            currency: "N/A",
            timestamp: "",
          },
      externalRecord: ext
        ? {
            reference: ext.reference,
            amount: ext.amount,
            currency: ext.currency,
            timestamp: ext.timestamp,
            status: ext.status,
          }
        : {
            reference: "N/A",
            amount: 0,
            currency: "N/A",
            timestamp: "",
            status: "N/A",
          },
      matchResult: result,
    };
  }
}
