"use client";

import { useEffect, useState } from "react";

interface Metrics {
  threshold: number;
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
  falsePositiveRate: number;
  expectedCostInr: number;
}
interface Evaluation {
  trainCount: number;
  testCount: number;
  sourceDatasetSize: number;
  fraudCount: number;
  costs: { falsePositiveInr: number; falseNegativeInr: number };
  optimal: Metrics;
  thresholds: Metrics[];
}
interface Ring {
  id: string;
  deviceId: string;
  members: string[];
  merchants: string[];
  transactionCount: number;
  exposureInr: number;
  firstSeen: string;
  lastSeen: string;
  evidence?: string[];
}
interface Score {
  riskScore: number;
  decision: string;
  modelProbability: number;
  triggeredRules: string[];
  topContributingFeatures: string[];
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function RiskCenter() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [rings, setRings] = useState<Ring[]>([]);
  const [threshold, setThreshold] = useState(0.5);
  const [tunedMetrics, setTunedMetrics] = useState<Metrics | null>(null);
  const [score, setScore] = useState<Score | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/risk/evaluate").then((response) => response.json()),
      fetch("/api/risk/rings").then((response) => response.json()),
    ])
      .then(([report, ringReport]) => {
        setEvaluation(report);
        setRings(ringReport.rings ?? []);
        setTunedMetrics(report.optimal);
      })
      .catch(() => setError("Risk data could not be loaded."))
      .finally(() => setBusy(false));
  }, []);

  async function tune(nextThreshold: number) {
    setThreshold(nextThreshold);
    const response = await fetch("/api/risk/threshold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threshold: nextThreshold }),
    });
    if (response.ok) setTunedMetrics(await response.json());
  }

  async function scoreExample() {
    const response = await fetch("/api/risk/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 25,
        deviceId: "fraud_device_demo",
        merchantId: "merchant_cluster_01",
      }),
    });
    if (response.ok) setScore(await response.json());
  }

  if (busy)
    return (
      <main className="p-6">
        <p>Evaluating held-out risk data...</p>
      </main>
    );
  if (error || !evaluation)
    return (
      <main className="p-6">
        <p className="text-red-600">{error ?? "No risk report available."}</p>
      </main>
    );
  const metrics = tunedMetrics ?? evaluation.optimal;
  return (
    <main className="space-y-8 p-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
          Defense operations
        </p>
        <h1 className="mt-1 text-3xl font-bold">AI Risk Manager</h1>
        <p className="mt-2 text-gray-600">
          Fraud-spike detection with explainable signals and cost-aware review
          thresholds.
        </p>
      </header>
      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Precision", percent(metrics.precision)],
          ["Recall", percent(metrics.recall)],
          ["F1 score", percent(metrics.f1)],
          [
            "Expected cost",
            `₹${metrics.expectedCostInr.toLocaleString("en-IN")}`,
          ],
        ].map(([label, value]) => (
          <article
            className="rounded-lg border bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Held-out evaluation</h2>
          <p className="mt-1 text-sm text-gray-500">
            Training: {evaluation.trainCount.toLocaleString()} | Test:{" "}
            {evaluation.testCount.toLocaleString()} | Fraud labels:{" "}
            {evaluation.fraudCount}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 text-center">
            <div className="rounded border p-4">
              <p className="text-2xl font-bold text-green-700">
                {metrics.truePositive}
              </p>
              <p className="text-xs text-gray-500">True positive</p>
            </div>
            <div className="rounded border p-4">
              <p className="text-2xl font-bold text-amber-700">
                {metrics.falsePositive}
              </p>
              <p className="text-xs text-gray-500">False positive</p>
            </div>
            <div className="rounded border p-4">
              <p className="text-2xl font-bold text-gray-700">
                {metrics.trueNegative}
              </p>
              <p className="text-xs text-gray-500">True negative</p>
            </div>
            <div className="rounded border p-4">
              <p className="text-2xl font-bold text-red-700">
                {metrics.falseNegative}
              </p>
              <p className="text-xs text-gray-500">False negative</p>
            </div>
          </div>
        </article>
        <article className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Threshold tuner</h2>
            <span className="font-mono text-sm">{threshold.toFixed(2)}</span>
          </div>
          <input
            aria-label="Risk threshold"
            className="mt-6 w-full accent-blue-600"
            max="0.9"
            min="0.1"
            onChange={(event) => void tune(Number(event.target.value))}
            step="0.05"
            type="range"
            value={threshold}
          />
          <div className="mt-5 space-y-2 text-sm text-gray-600">
            <p>
              False-positive rate:{" "}
              <strong>{percent(metrics.falsePositiveRate)}</strong>
            </p>
            <p>
              Review cost:{" "}
              <strong>
                ₹{evaluation.costs.falsePositiveInr.toLocaleString("en-IN")}
              </strong>{" "}
              per false positive
            </p>
            <p>
              Missed-loss cost:{" "}
              <strong>
                ₹{evaluation.costs.falseNegativeInr.toLocaleString("en-IN")}
              </strong>{" "}
              per false negative
            </p>
          </div>
        </article>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Live explained scorer</h2>
          <p className="mt-1 text-sm text-gray-500">
            Scores a defensive demo transaction using the trained detector.
          </p>
          <button
            className="mt-4 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={() => void scoreExample()}
          >
            Score suspicious example
          </button>
          {score && (
            <div className="mt-4 rounded border p-4">
              <p className="text-3xl font-bold">
                {score.riskScore}/100{" "}
                <span className="text-base">{score.decision}</span>
              </p>
              <p className="mt-2 text-sm text-gray-600">
                Model probability: {percent(score.modelProbability)}
              </p>
              <p className="mt-3 text-sm font-semibold">Signals</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
                {score.triggeredRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                Top features: {score.topContributingFeatures.join(", ")}
              </p>
            </div>
          )}
        </article>
        <article className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Detected abuse rings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Observable shared-device clusters surfaced for operator review.
          </p>
          <div className="mt-4 space-y-3">
            {rings.slice(0, 4).map((ring) => (
              <div className="rounded border p-4" key={ring.id}>
                <div className="flex justify-between">
                  <strong>{ring.id}</strong>
                  <span className="text-sm text-red-700">
                    ₹{ring.exposureInr.toLocaleString("en-IN")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {ring.members.length} customers | {ring.transactionCount}{" "}
                  transactions | {ring.merchants.join(", ")}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(ring.firstSeen).toLocaleString()} to{" "}
                  {new Date(ring.lastSeen).toLocaleString()}
                </p>
                {ring.evidence && (
                  <ul className="mt-2 list-disc pl-5 text-xs text-gray-500">
                    {ring.evidence.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {rings.length === 0 && (
              <p className="text-sm text-gray-500">
                No coordinated rings detected.
              </p>
            )}
          </div>
        </article>
      </section>
      <p className="text-xs text-gray-500">
        Synthetic seeded evaluation. Metrics are reproducible demo measurements,
        not production performance claims.
      </p>
    </main>
  );
}
