"use client";

/**
 * BankVerse — Health Monitor
 *
 * A clean, live dashboard that shows the health of every payment
 * pipeline stage. Run a full health check or test individual
 * services. No clutter — just status, issues, and history.
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────

interface ChaosScenario {
  id: string;
  name: string;
  description: string;
  severity: string;
  injectDescription: string;
  expectedBehavior: string;
}

interface ChaosTestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  severity: string;
  actualBehavior: string;
  invariantHeld?: boolean;
  invariantVerification?: string;
  duration: number;
}

interface ChaosTestReport {
  runAt: string;
  scenariosRun: number;
  passed: number;
  failed: number;
  passRate: number;
  invariantsHeld?: number;
  invariantRate?: number;
  results: ChaosTestResult[];
}

// ─── Service definitions ────────────────────────────────────────

interface ServiceStage {
  id: string;
  label: string;
  icon: string;
  targets: string[];
}

const SERVICES: ServiceStage[] = [
  { id: "customer", label: "Customer", icon: "👤", targets: [] },
  {
    id: "orchestrator",
    label: "Orchestrator",
    icon: "⚙️",
    targets: ["provider-timeout", "provider-down", "refund-race-condition"],
  },
  {
    id: "psp",
    label: "Payment Provider",
    icon: "🏦",
    targets: [
      "provider-timeout",
      "amount-mismatch",
      "duplicate-charge",
      "provider-down",
    ],
  },
  {
    id: "ledger",
    label: "Ledger",
    icon: "📒",
    targets: ["missing-credit", "worker-crash-after-commit"],
  },
  {
    id: "reconciliation",
    label: "Reconciliation",
    icon: "🔍",
    targets: [
      "amount-mismatch",
      "duplicate-charge",
      "missing-credit",
      "slow-reconciliation",
      "webhook-out-of-order",
    ],
  },
];

// ─── Helpers ────────────────────────────────────────────────────

function serviceStatus(
  service: ServiceStage,
  results: ChaosTestResult[],
): "healthy" | "degraded" | "failing" | "unknown" {
  if (service.targets.length === 0) return "healthy";
  const relevant = results.filter((r) => service.targets.includes(r.scenarioId));
  if (relevant.length === 0) return "unknown";
  const allPassed = relevant.every((r) => r.passed);
  const anyPassed = relevant.some((r) => r.passed);
  if (allPassed) return "healthy";
  if (anyPassed) return "degraded";
  return "failing";
}

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  healthy: {
    dot: "bg-emerald-500",
    text: "text-emerald-400",
    bg: "bg-emerald-500/5 border-emerald-500/20",
  },
  degraded: {
    dot: "bg-yellow-500",
    text: "text-yellow-400",
    bg: "bg-yellow-500/5 border-yellow-500/20",
  },
  failing: {
    dot: "bg-red-500",
    text: "text-red-400",
    bg: "bg-red-500/5 border-red-500/20",
  },
  unknown: {
    dot: "bg-slate-500",
    text: "text-slate-400",
    bg: "bg-slate-500/5 border-slate-500/20",
  },
};

// ─── Main Component ─────────────────────────────────────────────

export default function ChaosLab() {
  const [scenarios, setScenarios] = useState<ChaosScenario[]>([]);
  const [report, setReport] = useState<ChaosTestReport | null>(null);
  const [runHistory, setRunHistory] = useState<ChaosTestReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningSingle, setRunningSingle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });

  // ─── Load scenarios ───────────────────────────────────────────
  const loadScenarios = useCallback(async () => {
    try {
      const res = await fetch("/api/chaos?action=scenarios");
      const data = await res.json();
      if (data.success) setScenarios(data.scenarios);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  // ─── Run full health check ────────────────────────────────────
  const runFullCheck = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProgress({ current: 0, total: scenarios.length, label: "" });

    const results: ChaosTestResult[] = [];

    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i];
      setProgress({ current: i + 1, total: scenarios.length, label: s.name });

      try {
        const res = await fetch("/api/chaos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: s.id, action: "run" }),
        });
        const data = await res.json();
        if (data.success && data.result) results.push(data.result);
      } catch {
        // continue
      }
    }

    const passed = results.filter((r) => r.passed).length;
    const invariantsHeld = results.filter((r) => r.invariantHeld).length;
    const newReport: ChaosTestReport = {
      runAt: new Date().toISOString(),
      scenariosRun: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length > 0 ? passed / results.length : 0,
      invariantsHeld,
      invariantRate:
        results.length > 0 ? invariantsHeld / results.length : 0,
      results,
    };

    setReport(newReport);
    setRunHistory((prev) => [newReport, ...prev].slice(0, 20));
    setLoading(false);
  }, [scenarios]);

  // ─── Run single scenario ──────────────────────────────────────
  const runSingle = useCallback(async (scenarioId: string) => {
    setRunningSingle(scenarioId);
    setError(null);
    try {
      const res = await fetch("/api/chaos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId, action: "run" }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setReport((prev) => {
          const results = prev ? [...prev.results] : [];
          const idx = results.findIndex((r) => r.scenarioId === scenarioId);
          if (idx >= 0) results[idx] = data.result;
          else results.push(data.result);
          const passed = results.filter((r) => r.passed).length;
          const invariantsHeld = results.filter(
            (r) => r.invariantHeld,
          ).length;
          const newReport: ChaosTestReport = {
            runAt: new Date().toISOString(),
            scenariosRun: results.length,
            passed,
            failed: results.length - passed,
            passRate: results.length > 0 ? passed / results.length : 0,
            invariantsHeld,
            invariantRate:
              results.length > 0 ? invariantsHeld / results.length : 0,
            results,
          };
          setRunHistory((h) => [newReport, ...h].slice(0, 20));
          return newReport;
        });
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setRunningSingle(null);
    }
  }, []);

  // ─── Export ───────────────────────────────────────────────────
  const exportReport = useCallback(
    (format: "json" | "csv") => {
      if (!report) return;
      let content: string;
      let filename: string;
      let mime: string;

      if (format === "json") {
        content = JSON.stringify(report, null, 2);
        filename = `health-check-${new Date().toISOString().slice(0, 10)}.json`;
        mime = "application/json";
      } else {
        const headers = [
          "Scenario",
          "Severity",
          "Passed",
          "Duration (ms)",
          "Invariant Held",
          "Actual Behavior",
        ];
        const rows = report.results.map((r) =>
          [
            `"${r.scenarioName}"`,
            r.severity,
            r.passed ? "PASS" : "FAIL",
            r.duration,
            r.invariantHeld ? "YES" : "NO",
            `"${(r.actualBehavior || "").replace(/"/g, '""')}"`,
          ].join(","),
        );
        content = [headers.join(","), ...rows].join("\n");
        filename = `health-check-${new Date().toISOString().slice(0, 10)}.csv`;
        mime = "text/csv";
      }

      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    [report],
  );

  // ─── Compute overall status ───────────────────────────────────
  const overallStatus: "healthy" | "degraded" | "failing" | "unknown" = report
    ? report.passRate >= 0.9
      ? "healthy"
      : report.passRate >= 0.5
        ? "degraded"
        : "failing"
    : "unknown";

  const statusBanner = {
    healthy: {
      emoji: "🟢",
      text: "All Systems Operational",
      sub: "Every payment pipeline stage passed its health check.",
    },
    degraded: {
      emoji: "🟡",
      text: "Degraded Service",
      sub: `${report?.failed ?? 0} check(s) failed. Some services may be impacted.`,
    },
    failing: {
      emoji: "🔴",
      text: "Service Outage",
      sub: `${report?.failed ?? 0} check(s) failed. Immediate attention required.`,
    },
    unknown: {
      emoji: "⚪",
      text: "No Health Data",
      sub: "Run a health check to verify all payment services.",
    },
  }[overallStatus];

  const issues = report?.results.filter((r) => !r.passed) ?? [];

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* ── Status Banner ── */}
      <div
        className={`p-5 rounded-xl border ${STATUS_STYLES[overallStatus].bg}`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span>{statusBanner.emoji}</span>
              {statusBanner.text}
            </h2>
            <p className="text-sm text-slate-400 mt-1">{statusBanner.sub}</p>
            {report && (
              <p className="text-xs text-slate-500 mt-1">
                Last checked: {new Date(report.runAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {report && (
              <>
                <Button
                  variant="outline"
                  onClick={() => exportReport("json")}
                  className="border-slate-700 text-slate-400 hover:text-white text-xs"
                >
                  📥 JSON
                </Button>
                <Button
                  variant="outline"
                  onClick={() => exportReport("csv")}
                  className="border-slate-700 text-slate-400 hover:text-white text-xs"
                >
                  📊 CSV
                </Button>
              </>
            )}
            <Button
              onClick={runFullCheck}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              {loading
                ? `Checking ${progress.current}/${progress.total}...`
                : "🩺 Run Health Check"}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        {loading && (
          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>{progress.label}</span>
              <span>
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-300"
                style={{
                  width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <span>⚠️</span> {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Service Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {SERVICES.map((service) => {
          const status = report
            ? serviceStatus(service, report.results)
            : "unknown";
          const style = STATUS_STYLES[status];
          const relevant = report
            ? report.results.filter((r) =>
                service.targets.includes(r.scenarioId),
              )
            : [];
          const passed = relevant.filter((r) => r.passed).length;

          return (
            <div
              key={service.id}
              className={`p-4 rounded-xl border ${style.bg} transition-all duration-300`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{service.icon}</span>
                <span className="text-xs font-semibold text-slate-300">
                  {service.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${style.dot} ${status !== "unknown" ? "animate-pulse" : ""}`}
                />
                <span className={`text-xs font-medium capitalize ${style.text}`}>
                  {status}
                </span>
              </div>
              {relevant.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  {passed}/{relevant.length} checks passed
                </p>
              )}
              {service.targets.length === 0 && (
                <p className="text-[10px] text-slate-600 mt-1">
                  No checks needed
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Two-column: Issues + History ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Issues */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              {issues.length > 0
                ? `⚠️ Issues (${issues.length})`
                : "✅ No Issues"}
            </h3>
            {scenarios.length > 0 && (
              <select
                onChange={(e) => {
                  if (e.target.value) runSingle(e.target.value);
                }}
                value=""
                className="text-[10px] p-1.5 bg-slate-800 border border-slate-700 rounded text-slate-300"
              >
                <option value="">Run single check...</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="divide-y divide-slate-800 max-h-[400px] overflow-y-auto">
            {!report && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <span className="text-3xl mb-2">🩺</span>
                <p className="text-xs">Run a health check to see results</p>
              </div>
            )}
            {report &&
              report.results.map((r) => (
                <div
                  key={r.scenarioId}
                  className="px-4 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors"
                >
                  <span className="text-sm shrink-0">
                    {runningSingle === r.scenarioId
                      ? "⏳"
                      : r.passed
                        ? "✅"
                        : "❌"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">
                      {r.scenarioName}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {r.actualBehavior}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-600 tabular-nums">
                      {r.duration}ms
                    </span>
                    {r.invariantHeld !== undefined && (
                      <span
                        className={`ml-2 text-[10px] font-bold ${r.invariantHeld ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {r.invariantHeld ? "🔒" : "🔓"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* History */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-slate-200">
              📜 Recent Checks
            </h3>
          </div>
          <div className="max-h-[400px] overflow-y-auto">
            {runHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-600">
                <span className="text-3xl mb-2">📜</span>
                <p className="text-xs">History appears after your first check</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {runHistory.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setReport(h)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors text-left"
                  >
                    <span
                      className={`text-lg shrink-0 ${h.passRate >= 0.9 ? "" : h.passRate >= 0.5 ? "opacity-70" : "opacity-40"}`}
                    >
                      {h.passRate >= 0.9
                        ? "🟢"
                        : h.passRate >= 0.5
                          ? "🟡"
                          : "🔴"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200">
                        #{runHistory.length - i} —{" "}
                        {Math.round(h.passRate * 100)}% healthy
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {new Date(h.runAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-emerald-400 font-bold">
                        {h.passed}
                      </span>
                      <span className="text-[10px] text-slate-600"> / </span>
                      <span className="text-[10px] text-red-400 font-bold">
                        {h.failed}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {" "}
                        passed
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
