"use client";

import { useEffect, useState } from "react";

interface Evaluation { trainCount: number; testCount: number; sourceDatasetSize: number; fraudCount: number; optimal: { precision: number; recall: number; f1: number; expectedCostInr: number }; }

export default function RiskCenter() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/risk/evaluate").then((response) => response.json()).then(setEvaluation).finally(() => setLoading(false)); }, []);
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold">AI Risk Manager</h1>
      <p className="mt-1 text-sm text-gray-500">Defense-only fraud-spike detection with explainable review signals.</p>
      {loading ? <p className="mt-8">Evaluating held-out data...</p> : evaluation && <section className="mt-8 grid gap-4 md:grid-cols-4">
        {[["Precision", evaluation.optimal.precision], ["Recall", evaluation.optimal.recall], ["F1", evaluation.optimal.f1], ["Expected cost", `₹${evaluation.optimal.expectedCostInr.toLocaleString("en-IN")}`]].map(([label, value]) => <div className="rounded-lg border bg-white p-5 shadow-sm" key={label}><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-semibold">{typeof value === "number" ? `${(value * 100).toFixed(1)}%` : value}</p></div>)}
        <div className="md:col-span-4 rounded-lg border p-5 text-sm text-gray-600">Held-out evaluation sample: {evaluation.testCount.toLocaleString()} transactions, including {evaluation.fraudCount} labeled fraud cases. Source dataset: {evaluation.sourceDatasetSize.toLocaleString()} seeded transactions.</div>
      </section>}
    </main>
  );
}