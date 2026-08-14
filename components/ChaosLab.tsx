"use client";

/**
 * BankVerse — Chaos Lab Component
 *
 * Interactive UI for running chaos engineering scenarios.
 * Shows pass/fail results with severity badges and timing.
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
  injectDescription: string;
  expectedBehavior: string;
  actualBehavior: string;
  invariant?: string;
  invariantHeld?: boolean;
  invariantVerification?: string;
  details: Record<string, unknown>;
  duration: number;
}

interface ChaosTestReport {
  runAt: string;
  scenariosRun: number;
  passed: number;
  failed: number;
  passRate: number;
  results: ChaosTestResult[];
}

// ─── Severity Colors ────────────────────────────────────────────

const severityColors: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700 border-slate-300",
  MEDIUM: "bg-yellow-100 text-yellow-700 border-yellow-300",
  HIGH: "bg-orange-100 text-orange-700 border-orange-300",
  CRITICAL: "bg-red-100 text-red-700 border-red-300",
};

// ─── Component ──────────────────────────────────────────────────

export default function ChaosLab() {
  const [scenarios, setScenarios] = useState<ChaosScenario[]>([]);
  const [report, setReport] = useState<ChaosTestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningScenario, setRunningScenario] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customSeverity, setCustomSeverity] = useState("HIGH");
  const [customFailureType, setCustomFailureType] = useState("TIMEOUT");
  const [customLatency, setCustomLatency] = useState("500");
  const [customFailureRate, setCustomFailureRate] = useState("0.5");
  const [customSubmitting, setCustomSubmitting] = useState(false);

  // Load scenarios
  const loadScenarios = useCallback(async () => {
    try {
      const res = await fetch("/api/chaos?action=scenarios");
      const data = await res.json();
      if (data.success) setScenarios(data.scenarios);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  // Run single scenario
  const runScenario = useCallback(async (scenarioId: string) => {
    setRunningScenario(scenarioId);
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
          return {
            runAt: new Date().toISOString(),
            scenariosRun: results.length,
            passed,
            failed: results.length - passed,
            passRate: results.length > 0 ? passed / results.length : 0,
            results,
          };
        });
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunningScenario(null);
    }
  }, []);

  // Run all scenarios
  const runAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chaos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run-all" }),
      });
      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  const handleCustomInject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    setCustomSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/chaos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-custom",
          name: customName,
          severity: customSeverity,
          failureType: customFailureType,
          latencyMs: Number(customLatency) || 300,
          failureRate: Number(customFailureRate) || 0,
        }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setReport((prev) => {
          const results = prev ? [...prev.results] : [];
          const idx = results.findIndex((r) => r.scenarioId === data.scenario.id);
          if (idx >= 0) results[idx] = data.result;
          else results.push(data.result);
          const passed = results.filter((r) => r.passed).length;
          return {
            runAt: new Date().toISOString(),
            scenariosRun: results.length,
            passed,
            failed: results.length - passed,
            passRate: results.length > 0 ? passed / results.length : 0,
            invariantsHeld: results.filter((r) => r.invariantHeld).length,
            invariantRate: results.length > 0 ? results.filter((r) => r.invariantHeld).length / results.length : 0,
            results,
          };
        });
        await loadScenarios();
        setShowCustomForm(false);
        setCustomName("");
      } else if (data.error) {
        setError(data.error);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setCustomSubmitting(false);
    }
  };


  // Load scenarios on mount
  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Chaos Lab</h2>
          <p className="text-sm text-gray-500 mt-1">
            Test system resilience against failure scenarios
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => setShowCustomForm(!showCustomForm)}
          >
            {showCustomForm ? "Cancel Custom" : "+ Inject Custom Scenario"}
          </Button>
          <Button variant="outline" onClick={loadScenarios} disabled={loading}>
            Refresh
          </Button>
          <Button
            onClick={runAll}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? "Running..." : "Run All Scenarios"}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {/* Custom Scenario Form */}
      {showCustomForm && (
        <form
          onSubmit={handleCustomInject}
          className="p-5 bg-white border border-indigo-200 rounded-xl shadow-sm space-y-4"
        >
          <h3 className="font-bold text-gray-900 text-base">
            Inject Custom Chaos Failure Scenario
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Scenario Name
              </label>
              <input
                type="text"
                placeholder="e.g. Gateway Timeout & 50% Drop"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Failure Mode
              </label>
              <select
                value={customFailureType}
                onChange={(e) => setCustomFailureType(e.target.value)}
                className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="TIMEOUT">PSP Gateway Timeout (504)</option>
                <option value="AMOUNT_MISMATCH">10x Amount Mismatch</option>
                <option value="PROVIDER_DOWN">Provider Unreachable (500)</option>
                <option value="DUPLICATE_CHARGE">Duplicate PSP Charge</option>
                <option value="MISSING_CREDIT">Debit Without Credit Imbalance</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Severity Level
              </label>
              <select
                value={customSeverity}
                onChange={(e) => setCustomSeverity(e.target.value)}
                className="w-full text-xs p-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Simulated Latency (ms)
              </label>
              <input
                type="number"
                value={customLatency}
                onChange={(e) => setCustomLatency(e.target.value)}
                className="w-full text-xs p-2 border border-gray-300 rounded-lg"
                min="0"
                max="10000"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCustomForm(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={customSubmitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {customSubmitting ? "Injecting..." : "Inject & Run Scenario"}
            </Button>
          </div>
        </form>
      )}


      {/* Report Summary */}
      {report && (
        <div className="p-4 bg-white border rounded-xl shadow-sm">
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold">
              {(report.passRate * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-500">
              <span className="text-green-600 font-semibold">
                {report.passed} passed
              </span>
              {" / "}
              <span className="text-red-600 font-semibold">
                {report.failed} failed
              </span>
              {" / "}
              <span>{report.scenariosRun} total</span>
            </div>
            <div className="flex-1" />
            <div className="text-xs text-gray-400">
              Run at {new Date(report.runAt).toLocaleTimeString()}
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${report.passRate * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Scenarios Grid */}
      <div className="grid gap-4">
        {scenarios.map((scenario) => {
          const result = report?.results.find(
            (r) => r.scenarioId === scenario.id,
          );
          const isRunning = runningScenario === scenario.id;

          return (
            <div
              key={scenario.id}
              className={`p-4 bg-white border rounded-xl shadow-sm transition-all ${
                result
                  ? result.passed
                    ? "border-green-300 bg-green-50/30"
                    : "border-red-300 bg-red-50/30"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">
                      {scenario.name}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        severityColors[scenario.severity] || severityColors.LOW
                      }`}
                    >
                      {scenario.severity}
                    </span>
                    {result && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          result.passed
                            ? "bg-green-100 text-green-700 border border-green-300"
                            : "bg-red-100 text-red-700 border border-red-300"
                        }`}
                      >
                        {result.passed ? "PASSED" : "FAILED"}
                      </span>
                    )}
                    {isRunning && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 animate-pulse">
                        RUNNING...
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {scenario.description}
                  </p>

                  {/* Details */}
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="font-medium text-gray-700">Inject:</span>{" "}
                      <span className="text-gray-500">
                        {scenario.injectDescription}
                      </span>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="font-medium text-gray-700">Expect:</span>{" "}
                      <span className="text-gray-500">
                        {scenario.expectedBehavior}
                      </span>
                    </div>
                  </div>

                  {/* Result */}
                  {result && (
                    <div className="mt-3 p-3 bg-white border rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-700">
                          Actual:
                        </span>
                        <span
                          className={`text-sm ${
                            result.passed ? "text-green-700" : "text-red-700"
                          }`}
                        >
                          {result.actualBehavior}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">
                          {result.duration}ms
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runScenario(scenario.id)}
                  disabled={isRunning || loading}
                  className="shrink-0"
                >
                  {isRunning ? "Running..." : "Run"}
                </Button>
              </div>
            </div>
          );
        })}

        {scenarios.length === 0 && !loading && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">No scenarios loaded</p>
            <Button variant="outline" onClick={loadScenarios} className="mt-3">
              Load Scenarios
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
