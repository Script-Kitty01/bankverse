/**
 * BankVerse — Incident Correlator
 *
 * Groups related failures into single incidents so that
 * "1,200 broken transactions" from the same root cause
 * appear as ONE incident, not 1,200.
 *
 * Correlation dimensions:
 *   - provider        (razorpay, dwolla, plaid)
 *   - mismatchType    (AMOUNT_MISMATCH, MISSING_INTERNAL, etc.)
 *   - timeWindow      (5-minute buckets)
 *   - paymentMethod   (upi, card, netbanking, ach)
 *   - bank            (originating bank, if known)
 */

import type { PaymentIncident, IncidentSeverity } from "./detector";

// ─── Types ──────────────────────────────────────────────────────

export interface CorrelationKey {
  provider: string;
  mismatchType: string;
  timeWindow: string; // ISO timestamp truncated to 5-min bucket
  paymentMethod?: string;
  bank?: string;
}

export interface CorrelationResult {
  /** The merged incident (existing or new) */
  incident: PaymentIncident;
  /** Whether this was merged into an existing incident */
  wasMerged: boolean;
  /** The ID of the parent incident if merged */
  mergedIntoId: string | null;
}

// ─── Time Window ────────────────────────────────────────────────

const TIME_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Truncate a timestamp to the nearest 5-minute bucket.
 */
export function getTimeWindow(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const bucket = Math.floor(date.getTime() / TIME_WINDOW_MS) * TIME_WINDOW_MS;
  return new Date(bucket).toISOString();
}

// ─── Key Builder ────────────────────────────────────────────────

/**
 * Build a correlation key from incident properties.
 * Two incidents with the same key are considered the same root cause.
 */
export function buildCorrelationKey(params: {
  provider: string;
  mismatchType: string;
  detectedAt: string;
  paymentMethod?: string;
  bank?: string;
}): CorrelationKey {
  return {
    provider: params.provider,
    mismatchType: params.mismatchType,
    timeWindow: getTimeWindow(params.detectedAt),
    paymentMethod: params.paymentMethod,
    bank: params.bank,
  };
}

/**
 * Compare two correlation keys for equality.
 */
export function keysMatch(a: CorrelationKey, b: CorrelationKey): boolean {
  return (
    a.provider === b.provider &&
    a.mismatchType === b.mismatchType &&
    a.timeWindow === b.timeWindow &&
    (a.paymentMethod ?? "") === (b.paymentMethod ?? "") &&
    (a.bank ?? "") === (b.bank ?? "")
  );
}

// ─── Correlator ─────────────────────────────────────────────────

export class IncidentCorrelator {
  /**
   * Correlate a new incident against existing active incidents.
   *
   * If a matching incident exists (same provider + type + time window),
   * the new incident is merged into it. Otherwise, the new incident
   * stands alone.
   */
  static correlate(
    newIncident: PaymentIncident,
    existingIncidents: PaymentIncident[],
  ): CorrelationResult {
    // Use the primary mismatch type as the root-cause identifier.
    // The primary type is the most severe one, not just mismatchTypes[0].
    const primaryType = IncidentCorrelator.primaryMismatchType(
      newIncident.mismatchTypes,
    );

    const newKey = buildCorrelationKey({
      provider: newIncident.provider,
      mismatchType: primaryType,
      detectedAt: newIncident.detectedAt,
      paymentMethod: newIncident.paymentMethod,
      bank: newIncident.bank,
    });

    // Find an existing active incident with the same correlation key
    const match = existingIncidents.find((existing) => {
      if (existing.status === "RESOLVED" || existing.status === "DISMISSED") {
        return false;
      }
      const existingPrimary = IncidentCorrelator.primaryMismatchType(
        existing.mismatchTypes,
      );
      const existingKey = buildCorrelationKey({
        provider: existing.provider,
        mismatchType: existingPrimary,
        detectedAt: existing.detectedAt,
        paymentMethod: existing.paymentMethod,
        bank: existing.bank,
      });
      return keysMatch(newKey, existingKey);
    });

    if (match) {
      // Merge into existing incident
      match.affectedTransactionCount += newIncident.affectedTransactionCount;
      match.totalAffectedAmount += newIncident.totalAffectedAmount;
      match.reconciliationItemIds.push(...newIncident.reconciliationItemIds);

      // Merge mismatch types (deduplicate)
      for (const mt of newIncident.mismatchTypes) {
        if (!match.mismatchTypes.includes(mt)) {
          match.mismatchTypes.push(mt);
        }
      }

      // Escalate severity if the merged count is high
      match.severity = escalateSeverity(
        match.severity,
        match.affectedTransactionCount,
      );

      // Update title to reflect merged scope
      match.title = `${primaryType.replace(/_/g, " ")} on ${match.provider} — ${match.affectedTransactionCount} items`;

      // Add timeline event for the merge
      match.timeline.push({
        timestamp: new Date().toISOString(),
        event: "MERGED",
        detail: `Merged ${newIncident.affectedTransactionCount} additional items. Total: ${match.affectedTransactionCount}`,
      });

      return {
        incident: match,
        wasMerged: true,
        mergedIntoId: match.id,
      };
    }

    // No match — this is a new incident
    return {
      incident: newIncident,
      wasMerged: false,
      mergedIntoId: null,
    };
  }

  /**
   * Determine the primary (root-cause) mismatch type from a list.
   * The most severe type takes priority as the correlation anchor.
   */
  private static primaryMismatchType(mismatchTypes: string[]): string {
    if (mismatchTypes.length === 0) return "UNKNOWN";

    // Severity-ordered: CRITICAL types first, then HIGH, then rest
    const criticalTypes = [
      "DEBIT_WITHOUT_CREDIT",
      "AMOUNT_MISMATCH",
      "MISSING_INTERNAL",
    ];
    const highTypes = ["MISSING_EXTERNAL", "DUPLICATE", "FAILURE_RATE_SPIKE"];

    for (const ct of criticalTypes) {
      if (mismatchTypes.includes(ct)) return ct;
    }
    for (const ht of highTypes) {
      if (mismatchTypes.includes(ht)) return ht;
    }
    return mismatchTypes[0];
  }

  /**
   * Correlate a batch of new incidents against existing ones.
   * Returns the final list of all active incidents after merging.
   */
  static correlateBatch(
    newIncidents: PaymentIncident[],
    existingIncidents: PaymentIncident[],
  ): { allIncidents: PaymentIncident[]; mergeCount: number } {
    let mergeCount = 0;
    const merged = [...existingIncidents];

    for (const newInc of newIncidents) {
      const result = IncidentCorrelator.correlate(newInc, merged);
      if (result.wasMerged) {
        mergeCount++;
        // The merged incident is already in the list (mutated in place)
      } else {
        merged.push(result.incident);
      }
    }

    return { allIncidents: merged, mergeCount };
  }

  /**
   * Find all incidents that are likely the same root cause,
   * even across time windows (for post-hoc analysis).
   */
  static findRelated(
    incident: PaymentIncident,
    allIncidents: PaymentIncident[],
    windowCount = 6, // Look back 6 windows (30 min)
  ): PaymentIncident[] {
    const primaryType = IncidentCorrelator.primaryMismatchType(
      incident.mismatchTypes,
    );
    const baseKey = buildCorrelationKey({
      provider: incident.provider,
      mismatchType: primaryType,
      detectedAt: incident.detectedAt,
      paymentMethod: incident.paymentMethod,
      bank: incident.bank,
    });

    const baseTime = new Date(baseKey.timeWindow).getTime();

    return allIncidents.filter((other) => {
      if (other.id === incident.id) return false;

      const otherPrimary = IncidentCorrelator.primaryMismatchType(
        other.mismatchTypes,
      );
      const otherKey = buildCorrelationKey({
        provider: other.provider,
        mismatchType: otherPrimary,
        detectedAt: other.detectedAt,
        paymentMethod: other.paymentMethod,
        bank: other.bank,
      });

      const otherTime = new Date(otherKey.timeWindow).getTime();
      const windowDiff = Math.abs(otherTime - baseTime) / TIME_WINDOW_MS;

      return (
        otherKey.provider === baseKey.provider &&
        otherKey.mismatchType === baseKey.mismatchType &&
        windowDiff <= windowCount
      );
    });
  }
}

// ─── Severity Escalation ────────────────────────────────────────

function escalateSeverity(
  current: IncidentSeverity,
  affectedCount: number,
): IncidentSeverity {
  // Escalation thresholds (cumulative):
  //   ≥100 → always CRITICAL
  //   ≥50  → LOW→MEDIUM, MEDIUM→HIGH, HIGH→CRITICAL
  //   ≥20  → LOW→MEDIUM
  //   ≥10  → LOW→MEDIUM (smaller threshold for initial escalation)
  if (affectedCount >= 100) return "CRITICAL";
  if (affectedCount >= 50) {
    if (current === "LOW") return "MEDIUM";
    if (current === "MEDIUM") return "HIGH";
    if (current === "HIGH") return "CRITICAL";
  }
  if (affectedCount >= 20 && current === "LOW") return "MEDIUM";
  if (affectedCount >= 10 && current === "LOW") return "MEDIUM";
  return current;
}
