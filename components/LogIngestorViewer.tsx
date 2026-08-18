"use client";

/**
 * BankVerse — Transaction Log Ingestor & Policy Viewer Component
 *
 * Interactive dashboard to:
 * 1. Configure auto-solve toggles across all 9 fault categories
 * 2. Load transaction datasets from any URL, file upload, or Hugging Face Hub
 * 3. Search & inspect ingested logs and resolution statuses
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import AnimatedStatCounter from "@/components/AnimatedStatCounter";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut, Pie } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

interface AutoSolvePolicy {
  categoryId: string;
  categoryName: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  enabled: boolean;
  description: string;
  remediationAction: string;
}

interface TransactionLog {
  id: string;
  source: string;
  externalRef: string;
  eventType: string;
  category: string;
  categoryName: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  amount: number;
  currency: string;
  direction: "DEBIT" | "CREDIT";
  timestamp: string;
  ingestedAt: string;
  ingestStatus: string;
  resolutionStatus: string;
  resolutionDetails?: string;
}

interface IngestStats {
  totalIngested: number;
  acceptedCount: number;
  autoSolvedCount: number;
  unresolvedCount: number;
  duplicateCount: number;
  autoSolveRate: number;
  byCategory?: Record<string, number>;
  bySource?: Record<string, number>;
  byResolution?: Record<string, number>;
}

const severityBadgeColors: Record<string, string> = {
  LOW: "bg-slate-800 text-slate-400 border-slate-600",
  MEDIUM: "bg-yellow-900/30 text-yellow-400 border-yellow-800/50",
  HIGH: "bg-orange-900/30 text-orange-400 border-orange-800/50",
  CRITICAL: "bg-red-900/30 text-red-400 border-red-800/50",
};

const CATEGORY_CHART_COLORS: Record<string, string> = {
  "provider-timeout": "#f97316",
  "amount-mismatch": "#ef4444",
  "duplicate-charge": "#dc2626",
  "missing-credit": "#991b1b",
  "webhook-out-of-order": "#eab308",
  "provider-down": "#f97316",
  "slow-reconciliation": "#eab308",
  "worker-crash-after-commit": "#dc2626",
  "refund-race-condition": "#eab308",
};

const CATEGORY_LABELS: Record<string, string> = {
  "provider-timeout": "Provider Timeout",
  "amount-mismatch": "Amount Mismatch",
  "duplicate-charge": "Duplicate Charge",
  "missing-credit": "Missing Credit",
  "webhook-out-of-order": "Webhook OOO",
  "provider-down": "Provider Down",
  "slow-reconciliation": "Slow Recon",
  "worker-crash-after-commit": "Worker Crash",
  "refund-race-condition": "Refund Race",
};

const RESOLUTION_COLORS: Record<string, string> = {
  AUTO_SOLVED: "#16a34a",
  UNRESOLVED: "#ea580c",
  NOT_REQUIRED: "#6b7280",
  MANUAL_SOLVED: "#2563eb",
};

const SOURCE_COLORS = [
  "#0747b6",
  "#2265d8",
  "#2f91fa",
  "#5ba0fb",
  "#87bdfd",
  "#a5d0fd",
  "#c3dffe",
  "#e1eeff",
  "#f0f7ff",
  "#f8fbff",
];

export default function LogIngestorViewer() {
  const [policies, setPolicies] = useState<AutoSolvePolicy[]>([]);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [stats, setStats] = useState<IngestStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [ingestResult, setIngestResult] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetUrl, setDatasetUrl] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPolicies = useCallback(async () => {
    try {
      const res = await fetch("/api/logs/policies");
      const data = await res.json();
      if (data.success) setPolicies(data.policies);
    } catch (e) {
      console.error("Failed to load policies", e);
    }
  }, []);

  const loadLogsAndStats = useCallback(async () => {
    try {
      const statsRes = await fetch("/api/logs/stats");
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.stats);

      const params = new URLSearchParams();
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedStatus) params.set("resolutionStatus", selectedStatus);
      if (searchTerm) params.set("search", searchTerm);
      params.set("page", page.toString());
      params.set("limit", "15");

      const logsRes = await fetch(`/api/logs?${params.toString()}`);
      const logsData = await logsRes.json();
      if (logsData.success) {
        setLogs(logsData.logs);
        setTotalPages(logsData.totalPages || 1);
      }
    } catch (e) {
      console.error("Failed to load logs/stats", e);
    }
  }, [selectedCategory, selectedStatus, searchTerm, page]);

  useEffect(() => {
    loadPolicies();
    loadLogsAndStats();
  }, [loadPolicies, loadLogsAndStats]);

  const togglePolicy = async (categoryId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch("/api/logs/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, enabled: !currentEnabled }),
      });
      const data = await res.json();
      if (data.success) setPolicies(data.policies);
    } catch (e) {
      console.error("Failed to toggle policy", e);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm("Delete all ingested transaction logs? This cannot be undone.")) return;
    setLoading(true);
    try {
      const res = await fetch("/api/logs", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setIngestResult("All logs cleared successfully.");
        loadLogsAndStats();
      } else {
        setIngestResult(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setIngestResult(`Clear failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDataset = async () => {
    setDatasetLoading(true);
    setIngestResult(null);
    try {
      const res = await fetch("/api/logs/ingest-huggingface", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const lines = (data.results as any[]).map(
          (r) =>
            `${r.dataset}: ${r.accepted} accepted, ${r.autoSolved} auto-solved, ${r.unresolved} unresolved${r.error ? ` (error: ${r.error})` : ""}`,
        );
        setIngestResult(lines.join(" | "));
        loadLogsAndStats();
      } else {
        setIngestResult(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setIngestResult(`Dataset load failed: ${e.message}`);
    } finally {
      setDatasetLoading(false);
    }
  };

  const handleLoadFromUrl = async () => {
    if (!datasetUrl.trim()) return;
    setUrlLoading(true);
    setIngestResult(null);
    try {
      const res = await fetch("/api/logs/ingest-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: datasetUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.result;
        setIngestResult(
          `${r.source}: ${r.accepted} accepted, ${r.autoSolved} auto-solved, ${r.unresolved} unresolved (${r.recordsFetched} fetched)`,
        );
        loadLogsAndStats();
      } else {
        setIngestResult(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setIngestResult(`URL load failed: ${e.message}`);
    } finally {
      setUrlLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setFileLoading(true);
    setIngestResult(null);
    try {
      const text = await file.text();
      const isCSV =
        file.name.endsWith(".csv") ||
        text.trimStart().startsWith("reference,") ||
        text.trimStart().startsWith("Date,") ||
        text.trimStart().startsWith("Transaction,");

      let bodyData: any;
      if (isCSV) {
        bodyData = {
          source: file.name.replace(/\.[^.]+$/, ""),
          sourceType: "BANK_STATEMENT",
          rawFormat: "CSV",
          payload: text,
        };
      } else {
        const parsed = JSON.parse(text);
        bodyData = {
          source: file.name.replace(/\.[^.]+$/, ""),
          sourceType: "PROVIDER_FEED",
          rawFormat: "JSON",
          payload: Array.isArray(parsed) ? parsed : [parsed],
        };
      }

      const res = await fetch("/api/logs/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      const data = await res.json();
      if (data.success) {
        const r = data.result;
        setIngestResult(
          `${file.name}: ${r.accepted} accepted, ${r.autoSolved} auto-solved, ${r.unresolved} unresolved`,
        );
        loadLogsAndStats();
      } else {
        setIngestResult(`Error: ${data.error}`);
      }
    } catch (e: any) {
      setIngestResult(`File upload failed: ${e.message}`);
    } finally {
      setFileLoading(false);
    }
  };

  // ─── Export Logs ──────────────────────────────────────────────
  const exportLogsAsCSV = () => {
    if (logs.length === 0) return;
    const headers = [
      "Timestamp",
      "Reference",
      "Source",
      "Category",
      "Severity",
      "Amount",
      "Currency",
      "Direction",
      "Ingest Status",
      "Resolution Status",
      "Resolution Details",
    ];
    const rows = logs.map((l) => [
      l.timestamp,
      l.externalRef,
      l.source,
      l.categoryName,
      l.severity,
      l.amount,
      l.currency,
      l.direction,
      l.ingestStatus,
      l.resolutionStatus,
      `"${(l.resolutionDetails || "").replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    downloadBlob(
      csv,
      "text/csv",
      `bankverse-logs-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

  const exportLogsAsJSON = () => {
    if (logs.length === 0) return;
    const json = JSON.stringify(logs, null, 2);
    downloadBlob(
      json,
      "application/json",
      `bankverse-logs-${new Date().toISOString().slice(0, 10)}.json`,
    );
  };

  const downloadBlob = (content: string, mime: string, filename: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };
  return (
    <div className="space-y-8">
      {/* KPI Stats Cards — Animated */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
          <p className="text-sm font-medium text-slate-400">
            Total Ingested Logs
          </p>
          <p className="text-2xl font-bold text-slate-100 mt-1">
            <AnimatedStatCounter value={stats ? stats.totalIngested : 0} />
          </p>
          <p className="text-xs text-slate-500 mt-1">
            <AnimatedStatCounter value={stats ? stats.acceptedCount : 0} />{" "}
            accepted entries
          </p>
        </div>

        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
          <p className="text-sm font-medium text-slate-400">Auto-Solve Rate</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            <AnimatedStatCounter
              value={stats ? stats.autoSolveRate * 100 : 0}
              suffix="%"
              decimals={1}
            />
          </p>
          <p className="text-xs text-slate-500 mt-1">
            <AnimatedStatCounter value={stats ? stats.autoSolvedCount : 0} />{" "}
            auto-remediated
          </p>
        </div>

        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
          <p className="text-sm font-medium text-slate-400">
            Unresolved / Flagged
          </p>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            <AnimatedStatCounter value={stats ? stats.unresolvedCount : 0} />
          </p>
          <p className="text-xs text-slate-500 mt-1">Awaiting manual action</p>
        </div>

        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm">
          <p className="text-sm font-medium text-slate-400">
            Deduplicated Logs
          </p>
          <p className="text-2xl font-bold text-blue-400 mt-1">
            <AnimatedStatCounter value={stats ? stats.duplicateCount : 0} />
          </p>
          <p className="text-xs text-slate-500 mt-1">Identical hash blocked</p>
        </div>
      </div>

      {/* Charts Section */}
      {stats && (stats.byCategory || stats.bySource || stats.byResolution) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Category Distribution — Horizontal Bar */}
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">
              Fault Category Distribution
            </h3>
            {stats.byCategory && Object.keys(stats.byCategory).length > 0 ? (
              <div className="h-64">
                <Bar
                  data={{
                    labels: Object.keys(stats.byCategory).map(
                      (k) => CATEGORY_LABELS[k] || k,
                    ),
                    datasets: [
                      {
                        label: "Logs",
                        data: Object.values(stats.byCategory),
                        backgroundColor: Object.keys(stats.byCategory).map(
                          (k) => CATEGORY_CHART_COLORS[k] || "#6b7280",
                        ),
                        borderRadius: 4,
                      },
                    ],
                  }}
                  options={{
                    indexAxis: "y",
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => ` ${ctx.raw} logs`,
                        },
                      },
                    },
                    scales: {
                      x: {
                        ticks: { font: { size: 10 } },
                        grid: { color: "#f3f4f6" },
                      },
                      y: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">
                No data yet
              </p>
            )}
          </div>

          {/* Source Breakdown — Doughnut */}
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">
              Source Breakdown
            </h3>
            {stats.bySource && Object.keys(stats.bySource).length > 0 ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-48 h-48">
                  <Doughnut
                    data={{
                      labels: Object.keys(stats.bySource),
                      datasets: [
                        {
                          data: Object.values(stats.bySource),
                          backgroundColor: Object.keys(stats.bySource).map(
                            (_, i) => SOURCE_COLORS[i % SOURCE_COLORS.length],
                          ),
                          borderWidth: 2,
                          borderColor: "#fff",
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      cutout: "55%",
                      plugins: {
                        legend: {
                          position: "bottom",
                          labels: {
                            boxWidth: 10,
                            font: { size: 10 },
                            padding: 12,
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">
                No data yet
              </p>
            )}
          </div>

          {/* Resolution Status — Pie */}
          <div className="bg-slate-800 p-5 rounded-xl border border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4">
              Resolution Status
            </h3>
            {stats.byResolution &&
            Object.keys(stats.byResolution).length > 0 ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-48 h-48">
                  <Pie
                    data={{
                      labels: Object.keys(stats.byResolution).map((k) =>
                        k.replace(/_/g, " "),
                      ),
                      datasets: [
                        {
                          data: Object.values(stats.byResolution),
                          backgroundColor: Object.keys(stats.byResolution).map(
                            (k) => RESOLUTION_COLORS[k] || "#9ca3af",
                          ),
                          borderWidth: 2,
                          borderColor: "#fff",
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      plugins: {
                        legend: {
                          position: "bottom",
                          labels: {
                            boxWidth: 10,
                            font: { size: 10 },
                            padding: 12,
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">
                No data yet
              </p>
            )}
          </div>
        </div>
      )}

      {/* 9 Auto-Solve Category Toggles */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              Auto-Solve Policy Configuration (9 Fault Categories)
            </h2>
            <p className="text-sm text-slate-400">
              When enabled, incoming logs in that fault category are
              automatically remediated upon ingestion.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {policies.map((p) => (
            <div
              key={p.categoryId}
              className={`p-4 rounded-lg border flex flex-col justify-between transition-colors ${
                p.enabled
                  ? "bg-emerald-900/10 border-emerald-800/30"
                  : "bg-slate-800 border-slate-700"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm text-slate-100">
                    {p.categoryName}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-medium border ${
                      severityBadgeColors[p.severity] || "bg-slate-800"
                    }`}
                  >
                    {p.severity}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-2">{p.description}</p>
                <p className="text-[11px] text-slate-500 italic">
                  Action: {p.remediationAction}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-700 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">
                  Auto-Solve: {p.enabled ? "ON" : "OFF"}
                </span>
                <button
                  onClick={() => togglePolicy(p.categoryId, p.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    p.enabled ? "bg-emerald-600" : "bg-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-slate-200 transition-transform ${
                      p.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Dataset Ingestion */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            📥 Dataset Ingestion
          </h2>
          <p className="text-sm text-slate-400">
            Load transaction logs from any URL, upload a CSV/JSON file, or use
            pre-configured Hugging Face datasets.
          </p>
        </div>

        {/* Row 1: URL Input */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="url"
            placeholder="https://example.com/dataset.csv or .json"
            value={datasetUrl}
            onChange={(e) => setDatasetUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLoadFromUrl()}
            className="flex-1 text-xs px-3 py-2 bg-slate-900 text-slate-100 rounded-lg border border-slate-700 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
          />
          <Button
            onClick={handleLoadFromUrl}
            disabled={urlLoading || !datasetUrl.trim()}
            className="bg-bankGradient whitespace-nowrap"
            size="sm"
          >
            {urlLoading ? "⏳ Loading..." : "🌐 Load from URL"}
          </Button>
        </div>

        {/* Row 2: File Upload + Hugging Face Quick Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={fileLoading}
          >
            {fileLoading ? "⏳ Uploading..." : "📁 Upload CSV / JSON"}
          </Button>

          <span className="text-xs text-slate-600 mx-1">or</span>

          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadDataset}
            disabled={datasetLoading}
          >
            {datasetLoading ? "⏳ Fetching..." : "🤗 Hugging Face Datasets"}
          </Button>
        </div>

        {/* Dataset Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-700">
            <p className="text-xs font-semibold text-slate-200">
              alokkulkarni/financial_Transactions
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Real financial transaction records with categories, amounts, and
              descriptions.
            </p>
          </div>
          <div className="bg-slate-900 p-3 rounded-lg border border-slate-700">
            <p className="text-xs font-semibold text-slate-200">
              Andyrasika/bank_transactions
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Labelled bank transactions with supplier, account, and
              classification data.
            </p>
          </div>
        </div>

        {ingestResult && (
          <p className="text-xs font-medium text-emerald-400 bg-emerald-900/20 px-3 py-1.5 rounded border border-emerald-800/30">
            {ingestResult}
          </p>
        )}
      </div>

      {/* Log Table */}
      <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-100">
            Ingested Transaction Logs
          </h2>

          <div className="flex flex-wrap gap-2 w-full md:w-auto items-center">
            <input
              type="text"
              placeholder="Search reference or event..."
              className="text-xs px-3 py-1.5 border rounded-md focus:outline-none w-44"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            <select
              className="text-xs px-2 py-1.5 border rounded-md focus:outline-none"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories (9)</option>
              {policies.map((p) => (
                <option key={p.categoryId} value={p.categoryId}>
                  {p.categoryName}
                </option>
              ))}
            </select>

            <select
              className="text-xs px-2 py-1.5 border rounded-md focus:outline-none"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="AUTO_SOLVED">AUTO_SOLVED</option>
              <option value="UNRESOLVED">UNRESOLVED</option>
              <option value="NOT_REQUIRED">NOT_REQUIRED</option>
            </select>

            {/* Clear All Logs */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLogs}
              disabled={loading || (stats?.totalIngested ?? 0) === 0}
              className="border-red-800/50 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              🗑 Clear All
            </Button>

            {/* Export Dropdown */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen((v) => !v)}
                disabled={logs.length === 0}
              >
                ⬇ Export
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-10 py-1 min-w-[160px]">
                  <button
                    className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 flex items-center gap-2 text-slate-300"
                    onClick={exportLogsAsCSV}
                  >
                    <span>📄</span> Export as CSV
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 flex items-center gap-2 text-slate-300"
                    onClick={exportLogsAsJSON}
                  >
                    <span>📋</span> Export as JSON
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-700 border-b border-slate-600">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-400">
                  Timestamp
                </th>
                <th className="px-4 py-3 font-medium text-slate-400">
                  Reference
                </th>
                <th className="px-4 py-3 font-medium text-slate-400">Source</th>
                <th className="px-4 py-3 font-medium text-slate-400">
                  Category
                </th>
                <th className="px-4 py-3 font-medium text-slate-400">Amount</th>
                <th className="px-4 py-3 font-medium text-slate-400">
                  Ingest Status
                </th>
                <th className="px-4 py-3 font-medium text-slate-400">
                  Auto-Solve Result
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-800">
              {logs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-xs text-slate-500"
                  >
                    No ingested transaction logs found. Submit a batch above to
                    ingest!
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-700/50">
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-medium text-slate-200">
                      {log.externalRef}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 capitalize">
                      {log.source}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                          severityBadgeColors[log.severity] || "bg-slate-800"
                        }`}
                      >
                        {log.categoryName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-200">
                      ₹{log.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          log.ingestStatus === "ACCEPTED"
                            ? "bg-emerald-900/30 text-emerald-400"
                            : "bg-blue-900/30 text-blue-400"
                        }`}
                      >
                        {log.ingestStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            log.resolutionStatus === "AUTO_SOLVED"
                              ? "bg-emerald-900/30 text-emerald-400"
                              : log.resolutionStatus === "UNRESOLVED"
                                ? "bg-amber-900/30 text-amber-400"
                                : "bg-slate-700 text-slate-400"
                          }`}
                        >
                          {log.resolutionStatus}
                        </span>
                        {log.resolutionDetails && (
                          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                            {log.resolutionDetails}
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center pt-2">
          <p className="text-xs text-slate-400">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
