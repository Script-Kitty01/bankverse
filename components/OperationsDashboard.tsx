"use client";

/**
 * BankVerse — Operations Dashboard
 *
 * Centerpiece UI for Phase 5: shows KPIs, incidents, provider health,
 * and reconciliation status in a single operational view.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────

interface PaymentIncident {
  id: string;
  title: string;
  severity: string;
  status: string;
  provider: string;
  affectedTransactionCount: number;
  totalAffectedAmount: number;
  mismatchTypes: string[];
  detectedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

interface OperationsSnapshot {
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

// ─── Helpers ────────────────────────────────────────────────────

const severityColors: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  DETECTED: "bg-red-100 text-red-700",
  INVESTIGATING: "bg-blue-100 text-blue-700",
  ACTION_REQUIRED: "bg-orange-100 text-orange-700",
  RESOLVED: "bg-green-100 text-green-700",
  DISMISSED: "bg-gray-100 text-gray-500",
};

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount / 100);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Component ──────────────────────────────────────────────────

export default function OperationsDashboard() {
  const [snapshot, setSnapshot] = useState<OperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operations");
      const data = await res.json();
      if (data.success) {
        setSnapshot(data.snapshot);
      } else {
        setError(data.error || "Failed to load operations data");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
  }, [fetchSnapshot]);

  const resolveIncident = useCallback(
    async (incidentId: string) => {
      setResolvingId(incidentId);
      try {
        const res = await fetch("/api/operations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "resolve-incident",
            incidentId,
            resolution: "Resolved by operator",
          }),
        });
        const data = await res.json();
        if (data.success) {
          fetchSnapshot();
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setResolvingId(null);
      }
    },
    [fetchSnapshot],
  );

  const runReconciliation = useCallback(async () => {
    setLoading(true);
    try {
      await fetch("/api/reconciliation", { method: "POST" });
      fetchSnapshot();
    } catch (e: any) {
      setError(e.message);
    }
  }, [fetchSnapshot]);

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Operations Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Real-time payment operations overview
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={runReconciliation}
            disabled={loading}
          >
            Run Reconciliation
          </Button>
          <Button onClick={fetchSnapshot} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {snapshot && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Success Rate"
              value={`${(snapshot.successRate * 100).toFixed(1)}%`}
              sub={`${snapshot.successCount} / ${snapshot.totalTransactions}`}
              color="green"
            />
            <KpiCard
              label="Total Volume"
              value={formatINR(snapshot.totalVolume)}
              sub={`${snapshot.totalTransactions} transactions`}
              color="blue"
            />
            <KpiCard
              label="Active Incidents"
              value={snapshot.activeIncidents.toString()}
              sub={
                snapshot.criticalIncidents > 0
                  ? `${snapshot.criticalIncidents} critical`
                  : "All clear"
              }
              color={snapshot.criticalIncidents > 0 ? "red" : "green"}
            />
            <KpiCard
              label="Recon Match Rate"
              value={`${(snapshot.reconciliationStatus.matchRate * 100).toFixed(0)}%`}
              sub={
                snapshot.reconciliationStatus.pendingItems > 0
                  ? `${snapshot.reconciliationStatus.pendingItems} pending`
                  : "Fully matched"
              }
              color={
                snapshot.reconciliationStatus.matchRate >= 0.95
                  ? "green"
                  : "yellow"
              }
            />
          </div>

          {/* Provider Health */}
          <div className="p-4 bg-white border rounded-xl shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">
              Provider Health
            </h3>
            <div className="flex gap-4 flex-wrap">
              {Object.entries(snapshot.providerHealth).length > 0 ? (
                Object.entries(snapshot.providerHealth).map(
                  ([provider, healthy]) => (
                    <div
                      key={provider}
                      className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg"
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          healthy ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-sm font-medium capitalize">
                        {provider}
                      </span>
                      <span
                        className={`text-xs ${
                          healthy ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {healthy ? "Healthy" : "Down"}
                      </span>
                    </div>
                  ),
                )
              ) : (
                <span className="text-sm text-gray-400">
                  No provider health data
                </span>
              )}
            </div>
          </div>

          {/* Reconciliation Status */}
          <div className="p-4 bg-white border rounded-xl shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">
              Reconciliation Status
            </h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Last Run</span>
                <p className="font-medium text-gray-900">
                  {snapshot.reconciliationStatus.lastRunAt
                    ? timeAgo(snapshot.reconciliationStatus.lastRunAt)
                    : "Never"}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Match Rate</span>
                <p className="font-medium text-gray-900">
                  {(snapshot.reconciliationStatus.matchRate * 100).toFixed(0)}%
                </p>
              </div>
              <div>
                <span className="text-gray-500">Pending Items</span>
                <p
                  className={`font-medium ${
                    snapshot.reconciliationStatus.pendingItems > 0
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {snapshot.reconciliationStatus.pendingItems}
                </p>
              </div>
            </div>
          </div>

          {/* Incidents */}
          <div className="p-4 bg-white border rounded-xl shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">
              Incidents ({snapshot.recentIncidents.length})
            </h3>
            {snapshot.recentIncidents.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-lg">🎉 No active incidents</p>
                <p className="text-sm mt-1">All systems operational</p>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshot.recentIncidents.map((incident) => (
                  <div
                    key={incident.id}
                    className="p-3 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-gray-900 text-sm">
                            {incident.title}
                          </h4>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              severityColors[incident.severity] || ""
                            }`}
                          >
                            {incident.severity}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              statusColors[incident.status] || ""
                            }`}
                          >
                            {incident.status}
                          </span>
                        </div>
                        <div className="flex gap-4 mt-1 text-xs text-gray-500">
                          <span>
                            Provider:{" "}
                            <span className="font-medium capitalize">
                              {incident.provider}
                            </span>
                          </span>
                          <span>
                            Affected: {incident.affectedTransactionCount} txs
                          </span>
                          <span>{formatINR(incident.totalAffectedAmount)}</span>
                          <span>Detected {timeAgo(incident.detectedAt)}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveIncident(incident.id)}
                        disabled={resolvingId === incident.id}
                        className="shrink-0 text-xs"
                      >
                        {resolvingId === incident.id ? "..." : "Resolve"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: "green" | "blue" | "red" | "yellow";
}) {
  const colorMap = {
    green: "border-green-200 bg-green-50/50",
    blue: "border-blue-200 bg-blue-50/50",
    red: "border-red-200 bg-red-50/50",
    yellow: "border-yellow-200 bg-yellow-50/50",
  };

  const valueColorMap = {
    green: "text-green-700",
    blue: "text-blue-700",
    red: "text-red-700",
    yellow: "text-yellow-700",
  };

  return (
    <div className={`p-4 border rounded-xl ${colorMap[color]}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${valueColorMap[color]}`}>
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
