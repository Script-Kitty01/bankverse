/**
 * BankVerse — Incident Detector
 *
 * Detects payment incidents by analyzing reconciliation results,
 * failure rate spikes, and provider-level anomalies.
 * Groups related mismatches into actionable incidents.
 */

import type { ReconciliationItem, ReconciliationReport } from "@/lib/reconciliation/types";
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

export interface PaymentIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  provider: string;
  affectedTransactionCount: number;
  totalAffectedAmount: number;
  mismatchTypes: string[];
  reconciliationItemIds: string[];
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
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
  reconciliationStatus: {
    lastRunAt: string | null;
    matchRate: number;
    pendingItems: number;
  };
  providerHealth: Record<string, boolean>;
  recentIncidents: PaymentIncident[];
}

// ─── In-Memory Store ────────────────────────────────────────────

const incidents: PaymentIncident[] = [];

// ─── Detector ───────────────────────────────────────────────────

export class IncidentDetector {
  /**
   * Analyze reconciliation report and detect incidents.
   * Groups mismatches by provider and mismatch type.
   */
  static detectFromReconciliation(
    report: ReconciliationReport,
  ): PaymentIncident[] {
    const newIncidents: PaymentIncident[] = [];

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

      const incident: PaymentIncident = {
        id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: `${mismatchType.replace(/_/g, " ")} — ${items.length} items`,
        severity,
        status: "DETECTED",
        provider: report.run.provider,
        affectedTransactionCount: items.length,
        totalAffectedAmount: totalAmount,
        mismatchTypes: [mismatchType],
        reconciliationItemIds: items.map((i) => i.id),
        detectedAt: new Date().toISOString(),
        resolvedAt: null,
        resolution: null,
      };

      // Correlate: merge into existing incident if same provider+type+window
      const result = IncidentCorrelator.correlate(incident, incidents);
      if (!result.wasMerged) {
        incidents.push(incident);
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
          failureRate > 0.5 ? "CRITICAL" : failureRate > 0.35 ? "HIGH" : "MEDIUM";

        const totalAmount = failed.reduce((sum, t) => sum + t.amount, 0);

        const incident: PaymentIncident = {
          id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          title: `High failure rate on ${provider}: ${(failureRate * 100).toFixed(0)}% (${failed.length}/${txs.length})`,
          severity,
          status: "DETECTED",
          provider,
          affectedTransactionCount: failed.length,
          totalAffectedAmount: totalAmount,
          mismatchTypes: ["FAILURE_RATE_SPIKE"],
          reconciliationItemIds: [],
          detectedAt: new Date().toISOString(),
          resolvedAt: null,
          resolution: null,
        };

        // Correlate: merge into existing incident if same provider+type+window
        const result = IncidentCorrelator.correlate(incident, incidents);
        if (!result.wasMerged) {
          incidents.push(incident);
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

    incident.status = status;
    if (status === "RESOLVED") {
      incident.resolvedAt = new Date().toISOString();
      incident.resolution = resolution || "Resolved";
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
      reconciliationStatus: {
        lastRunAt: reconciliationReport?.run.completedAt || null,
        matchRate: reconciliationReport?.summary.matchRate || 0,
        pendingItems:
          reconciliationReport?.items.filter(
            (i) => i.matchStatus !== "MATCHED",
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
