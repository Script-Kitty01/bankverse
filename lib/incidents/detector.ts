/**
 * BankVerse — Incident Detector
 *
 * Detects payment incidents by analyzing reconciliation results,
 * failure rate spikes, and provider-level anomalies.
 * Groups related mismatches into actionable incidents.
 */

import type {
  ReconciliationItem,
  ReconciliationReport,
} from "@/lib/reconciliation/types";
import type { PaymentTransaction } from "@/lib/ledger/types";
import { IncidentCorrelator } from "./correlator";

// ─── Types ──────────────────────────────────────────────────────

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus =
  | "DETECTED"
  | "INVESTIGATING"
  | "ACTION_REQUIRED"
  | "RESOLVED"
  | "DISMISSED";

export interface IncidentTimelineEvent {
  timestamp: string;
  event:
    | "DETECTED"
    | "ESCALATED"
    | "MERGED"
    | "INVESTIGATING"
    | "ACTION_REQUIRED"
    | "RESOLVED"
    | "DISMISSED";
  detail: string;
}

export interface PaymentIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  provider: string;
  /** Payment method(s) involved (upi, card, netbanking, ach) */
  paymentMethod?: string;
  /** Originating bank, if known */
  bank?: string;
  affectedTransactionCount: number;
  totalAffectedAmount: number;
  /** All mismatch types observed (not just the first) */
  mismatchTypes: string[];
  reconciliationItemIds: string[];
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  /** Ordered timeline of events for this incident */
  timeline: IncidentTimelineEvent[];
}

export interface OperationsSnapshot {
  timestamp: string;
  totalTransactions: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  totalVolume: number;
  activeIncidents: number;
  criticalIncidents: number;
  /** Fraction of incidents auto-resolved (0-1) */
  autoResolutionRate: number;
  /** Fraction of incidents requiring manual intervention (0-1) */
  manualInterventionRate: number;
  /** Mean time to resolve in milliseconds */
  mttrMs: number;
  /** Total number of transactions affected by active incidents */
  affectedTransactionVolume: number;
  /** Total monetary value affected by active incidents */
  affectedMoneyVolume: number;
  reconciliationStatus: {
    lastRunAt: string | null;
    matchRate: number;
    pendingItems: number;
  };
  providerHealth: Record<string, boolean>;
  recentIncidents: PaymentIncident[];
}

// ─── In-Memory Store ────────────────────────────────────────────

const MAX_INCIDENTS = 500;
const incidents: PaymentIncident[] = [];

/** Prune oldest resolved/dismissed incidents when over limit. */
function pruneIncidents(): void {
  if (incidents.length <= MAX_INCIDENTS) return;

  // Remove oldest resolved/dismissed first
  const closed = incidents
    .map((inc, idx) => ({ inc, idx }))
    .filter(
      ({ inc }) => inc.status === "RESOLVED" || inc.status === "DISMISSED",
    )
    .sort(
      (a, b) =>
        new Date(a.inc.detectedAt).getTime() -
        new Date(b.inc.detectedAt).getTime(),
    );

  const toRemove = incidents.length - MAX_INCIDENTS;
  for (let i = 0; i < Math.min(toRemove, closed.length); i++) {
    const idx = incidents.indexOf(closed[i].inc);
    if (idx !== -1) incidents.splice(idx, 1);
  }

  // If still over limit, remove oldest regardless of status
  if (incidents.length > MAX_INCIDENTS) {
    incidents.splice(0, incidents.length - MAX_INCIDENTS);
  }
}

// ─── Detector ───────────────────────────────────────────────────

export class IncidentDetector {
  /**
   * Analyze reconciliation report and detect incidents.
   * Groups mismatches by provider and mismatch type.
   */
  static detectFromReconciliation(
    report: ReconciliationReport,
    transactions?: PaymentTransaction[],
  ): PaymentIncident[] {
    const newIncidents: PaymentIncident[] = [];

    // Build lookup for transaction method/bank
    const txLookup = new Map<string, PaymentTransaction>();
    if (transactions) {
      for (const tx of transactions) txLookup.set(tx.id, tx);
    }

    // Group mismatched items by mismatch type
    const mismatched = report.items.filter(
      (i) => i.matchStatus === "MISMATCHED" || i.matchStatus === "UNMATCHED",
    );

    if (mismatched.length === 0) return [];

    // Group by mismatch type
    const byType = new Map<string, ReconciliationItem[]>();
    for (const item of mismatched) {
      const key = item.mismatchType || "UNKNOWN";
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key)!.push(item);
    }

    for (const [mismatchType, items] of byType) {
      const severity = IncidentDetector.classifySeverity(
        mismatchType,
        items.length,
      );

      const totalAmount = items.reduce(
        (sum, i) => sum + Math.abs(i.difference),
        0,
      );

      // Extract payment method and bank from the first matched transaction
      const firstTx = txLookup.get(items[0]?.internalTransactionId || "");

      const now = new Date().toISOString();
      const incident: PaymentIncident = {
        id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: `${mismatchType.replace(/_/g, " ")} — ${items.length} items`,
        severity,
        status: "DETECTED",
        provider: report.run.provider,
        paymentMethod: firstTx?.method,
        bank: firstTx?.bank,
        affectedTransactionCount: items.length,
        totalAffectedAmount: totalAmount,
        mismatchTypes: [mismatchType],
        reconciliationItemIds: items.map((i) => i.id),
        detectedAt: now,
        resolvedAt: null,
        resolution: null,
        timeline: [
          {
            timestamp: now,
            event: "DETECTED",
            detail: `Detected ${items.length} ${mismatchType.replace(/_/g, " ")} items on ${report.run.provider}`,
          },
        ],
      };

      // Correlate: merge into existing incident if same provider+type+window
      const result = IncidentCorrelator.correlate(incident, incidents);
      if (!result.wasMerged) {
        incidents.push(incident);
        pruneIncidents();
      }
      newIncidents.push(result.incident);
    }

    return newIncidents;
  }

  /**
   * Detect incidents from payment transactions (failure rate spike).
   */
  static detectFromTransactions(
    transactions: PaymentTransaction[],
  ): PaymentIncident[] {
    const newIncidents: PaymentIncident[] = [];

    if (transactions.length === 0) return [];

    // Group by provider
    const byProvider = new Map<string, PaymentTransaction[]>();
    for (const tx of transactions) {
      if (!byProvider.has(tx.provider)) byProvider.set(tx.provider, []);
      byProvider.get(tx.provider)!.push(tx);
    }

    for (const [provider, txs] of byProvider) {
      const failed = txs.filter((t) => t.paymentState === "FAILED");
      const failureRate = failed.length / txs.length;

      // Alert if failure rate > 20% and at least 3 failures
      if (failureRate > 0.2 && failed.length >= 3) {
        const severity: IncidentSeverity =
          failureRate > 0.5
            ? "CRITICAL"
            : failureRate > 0.35
              ? "HIGH"
              : "MEDIUM";

        const totalAmount = failed.reduce((sum, t) => sum + t.amount, 0);

        // Extract payment method and bank from the first failed transaction
        const firstFailed = failed[0];
        const now = new Date().toISOString();

        const incident: PaymentIncident = {
          id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: `High failure rate on ${provider}: ${(failureRate * 100).toFixed(0)}% (${failed.length}/${txs.length})`,
          severity,
          status: "DETECTED",
          provider,
          paymentMethod: firstFailed.method,
          bank: firstFailed.bank,
          affectedTransactionCount: failed.length,
          totalAffectedAmount: totalAmount,
          mismatchTypes: ["FAILURE_RATE_SPIKE"],
          reconciliationItemIds: [],
          detectedAt: now,
          resolvedAt: null,
          resolution: null,
          timeline: [
            {
              timestamp: now,
              event: "DETECTED",
              detail: `Detected ${(failureRate * 100).toFixed(0)}% failure rate on ${provider} (${failed.length}/${txs.length})`,
            },
          ],
        };

        // Correlate: merge into existing incident if same provider+type+window
        const result = IncidentCorrelator.correlate(incident, incidents);
        if (!result.wasMerged) {
          incidents.push(incident);
          pruneIncidents();
        }
        newIncidents.push(result.incident);
      }
    }

    return newIncidents;
  }

  /**
   * Get all incidents, optionally filtered by status.
   */
  static getIncidents(status?: IncidentStatus): PaymentIncident[] {
    if (status) return incidents.filter((i) => i.status === status);
    return [...incidents];
  }

  /**
   * Get active (non-resolved, non-dismissed) incidents.
   */
  static getActiveIncidents(): PaymentIncident[] {
    return incidents.filter(
      (i) => i.status !== "RESOLVED" && i.status !== "DISMISSED",
    );
  }

  /**
   * Update incident status.
   */
  static updateIncident(
    incidentId: string,
    status: IncidentStatus,
    resolution?: string,
  ): PaymentIncident | null {
    const incident = incidents.find((i) => i.id === incidentId);
    if (!incident) return null;

    const now = new Date().toISOString();
    incident.status = status;

    if (status === "RESOLVED") {
      incident.resolvedAt = now;
      incident.resolution = resolution || "Resolved";
      incident.timeline.push({
        timestamp: now,
        event: "RESOLVED",
        detail: resolution || "Resolved",
      });
    } else if (status === "DISMISSED") {
      incident.timeline.push({
        timestamp: now,
        event: "DISMISSED",
        detail: resolution || "Dismissed",
      });
    } else if (status === "INVESTIGATING") {
      incident.timeline.push({
        timestamp: now,
        event: "INVESTIGATING",
        detail: resolution || "Investigation started",
      });
    } else if (status === "ACTION_REQUIRED") {
      incident.timeline.push({
        timestamp: now,
        event: "ACTION_REQUIRED",
        detail: resolution || "Manual action required",
      });
    }

    return incident;
  }

  /**
   * Generate a full operations snapshot.
   */
  static getOperationsSnapshot(
    transactions: PaymentTransaction[],
    reconciliationReport?: ReconciliationReport | null,
    providerHealth?: Record<string, boolean>,
  ): OperationsSnapshot {
    const successCount = transactions.filter(
      (t) => t.paymentState === "SUCCESS",
    ).length;
    const failedCount = transactions.filter(
      (t) => t.paymentState === "FAILED",
    ).length;
    const totalVolume = transactions.reduce((sum, t) => sum + t.amount, 0);
    const activeIncidents = IncidentDetector.getActiveIncidents();
    const criticalIncidents = activeIncidents.filter(
      (i) => i.severity === "CRITICAL",
    ).length;

    // ─── Operational Metrics ──────────────────────────────────

    // Auto-resolution rate: resolved incidents that were never escalated to ACTION_REQUIRED
    const resolvedIncidents = incidents.filter((i) => i.status === "RESOLVED");
    const autoResolved = resolvedIncidents.filter((i) => {
      const hadManual = i.timeline.some((e) => e.event === "ACTION_REQUIRED");
      return !hadManual;
    });
    const autoResolutionRate =
      resolvedIncidents.length > 0
        ? autoResolved.length / resolvedIncidents.length
        : 0;
    const manualInterventionRate =
      resolvedIncidents.length > 0 ? 1 - autoResolutionRate : 0;

    // MTTR: mean time to resolve in milliseconds
    const resolvedWithTimes = resolvedIncidents.filter(
      (i) => i.resolvedAt && i.detectedAt,
    );
    const mttrMs =
      resolvedWithTimes.length > 0
        ? resolvedWithTimes.reduce((sum, i) => {
            const duration =
              new Date(i.resolvedAt!).getTime() -
              new Date(i.detectedAt).getTime();
            return sum + duration;
          }, 0) / resolvedWithTimes.length
        : 0;

    // Affected transaction & money volume from active incidents
    const affectedTransactionVolume = activeIncidents.reduce(
      (sum, i) => sum + i.affectedTransactionCount,
      0,
    );
    const affectedMoneyVolume = activeIncidents.reduce(
      (sum, i) => sum + i.totalAffectedAmount,
      0,
    );

    return {
      timestamp: new Date().toISOString(),
      totalTransactions: transactions.length,
      successCount,
      failedCount,
      successRate:
        transactions.length > 0 ? successCount / transactions.length : 0,
      totalVolume,
      activeIncidents: activeIncidents.length,
      criticalIncidents,
      autoResolutionRate,
      manualInterventionRate,
      mttrMs,
      affectedTransactionVolume,
      affectedMoneyVolume,
      reconciliationStatus: {
        lastRunAt: reconciliationReport?.run.completedAt || null,
        matchRate: reconciliationReport?.summary.matchRate || 0,
        pendingItems:
          reconciliationReport?.items.filter(
            (i) =>
              i.matchStatus !== "MATCHED_EXACT" &&
              i.matchStatus !== "MATCHED_FUZZY",
          ).length || 0,
      },
      providerHealth: providerHealth || {},
      recentIncidents: activeIncidents.slice(0, 10),
    };
  }

  // ─── Private ──────────────────────────────────────────────────

  private static classifySeverity(
    mismatchType: string,
    count: number,
  ): IncidentSeverity {
    const criticalTypes = [
      "AMOUNT_MISMATCH",
      "MISSING_INTERNAL",
      "DEBIT_WITHOUT_CREDIT",
    ];
    const highTypes = ["MISSING_EXTERNAL", "DUPLICATE"];

    if (criticalTypes.includes(mismatchType) && count >= 1) return "CRITICAL";
    if (highTypes.includes(mismatchType) && count >= 1) return "HIGH";
    if (count >= 10) return "HIGH";
    if (count >= 5) return "MEDIUM";
    return "LOW";
  }
}
