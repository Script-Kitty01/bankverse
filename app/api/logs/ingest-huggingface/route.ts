/**
 * BankVerse — Hugging Face Dataset Ingestion API
 *
 * POST /api/logs/ingest-huggingface
 * Fetches real banking transaction datasets from Hugging Face Hub,
 * transforms them, and feeds them into the ingestion pipeline.
 */

import { NextResponse } from "next/server";
import { LogIngestor } from "@/lib/ingestion/ingestor";

const HF_DATASETS = [
  {
    name: "alokkulkarni/financial_Transactions",
    url: "https://huggingface.co/datasets/alokkulkarni/financial_Transactions/raw/main/transactions.csv",
    source: "huggingface:financial_transactions",
  },
  {
    name: "Andyrasika/bank_transactions",
    url: "https://huggingface.co/datasets/Andyrasika/bank_transactions/raw/main/labelled_transactions.csv",
    source: "huggingface:bank_transactions",
  },
];

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim().replace(/^["']|["']$/g, ""));
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (values[idx] !== undefined) record[header] = values[idx];
    });
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

export async function POST() {
  const results: {
    dataset: string;
    records: number;
    accepted: number;
    autoSolved: number;
    unresolved: number;
    duplicates: number;
    error?: string;
  }[] = [];

  for (const ds of HF_DATASETS) {
    try {
      const response = await fetch(ds.url, {
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        results.push({
          dataset: ds.name,
          records: 0,
          accepted: 0,
          autoSolved: 0,
          unresolved: 0,
          duplicates: 0,
          error: `HTTP ${response.status}`,
        });
        continue;
      }

      const csvText = await response.text();
      const records = parseCsv(csvText);

      const faultStatuses = [
        "504_gateway_timeout",
        "amount_mismatch_delta",
        "double_charge_detected",
        "debit_without_credit",
        "out_of_order_webhook",
        "503_service_unavailable",
        "bulk_mismatch_batch",
        "worker_crash_post_commit",
        "refund_before_capture",
        "completed_settled",
      ];

      const formattedLogs = records.slice(0, 50).map((row, idx) => {
        const amountStr =
          row["Amount"] ||
          row["Transaction value (£)"] ||
          row["Transaction value ()"] ||
          "100";
        const amount =
          parseFloat(amountStr.toString().replace(/[^0-9.-]/g, "")) || 100;
        const ref = row["Account"] || row["Supplier"]
          ? `${row["Account"] || row["Supplier"]}_${idx}`
          : `hf_ref_${Date.now()}_${idx}`;
        const desc =
          row["Description"] ||
          row["Classification"] ||
          "Hugging Face Transaction";
        const status = faultStatuses[idx % faultStatuses.length];

        return {
          reference: ref,
          source: ds.source,
          sourceType: "BANK_STATEMENT" as const,
          amount: Math.abs(amount),
          currency: "INR",
          status,
          description: `${desc} [${row["Category"] || row["Classification"] || "General"}]`,
          timestamp: new Date().toISOString(),
        };
      });

      const ingestResult = await LogIngestor.ingest({
        source: ds.source,
        sourceType: "BANK_STATEMENT",
        rawFormat: "JSON",
        payload: formattedLogs,
      });

      results.push({
        dataset: ds.name,
        records: records.length,
        accepted: ingestResult.accepted,
        autoSolved: ingestResult.autoSolved,
        unresolved: ingestResult.unresolved,
        duplicates: ingestResult.duplicates,
      });
    } catch (err: any) {
      results.push({
        dataset: ds.name,
        records: 0,
        accepted: 0,
        autoSolved: 0,
        unresolved: 0,
        duplicates: 0,
        error: err.message,
      });
    }
  }

  return NextResponse.json({
    success: true,
    results,
  });
}
