/**
 * BankVerse — Generic URL Dataset Ingestion API
 *
 * POST /api/logs/ingest-url
 * Fetches a CSV or JSON dataset from any URL, transforms it,
 * and feeds it into the ingestion pipeline.
 */

import { NextResponse } from "next/server";
import { LogIngestor } from "@/lib/ingestion/ingestor";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url, source: customSource } = body as { url: string; source?: string };

    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 },
      );
    }

    const source = customSource || new URL(url).hostname.replace(/^www\./, "");

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch URL: HTTP ${response.status}` },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    let formattedLogs: any[];

    if (contentType.includes("text/csv") || url.endsWith(".csv") || text.trimStart().startsWith("reference,") || text.trimStart().startsWith("Date,") || text.trimStart().startsWith("Transaction,")) {
      // CSV path
      const records = parseCsv(text);

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

      formattedLogs = records.slice(0, 100).map((row, idx) => {
        const amountStr =
          row["Amount"] ||
          row["Transaction value (£)"] ||
          row["Transaction value ()"] ||
          row["amount"] ||
          "100";
        const amount =
          parseFloat(amountStr.toString().replace(/[^0-9.-]/g, "")) || 100;
        const ref = row["Account"] || row["Supplier"] || row["reference"] || row["transactionId"]
          ? `${row["Account"] || row["Supplier"] || row["reference"] || row["transactionId"]}_${idx}`
          : `url_ref_${Date.now()}_${idx}`;
        const desc =
          row["Description"] ||
          row["Classification"] ||
          row["description"] ||
          "URL Dataset Transaction";
        const status = faultStatuses[idx % faultStatuses.length];

        return {
          reference: ref,
          source,
          sourceType: "BANK_STATEMENT" as const,
          amount: Math.abs(amount),
          currency: row["currency"] || row["Currency"] || "INR",
          status,
          description: `${desc} [${row["Category"] || row["Classification"] || row["category"] || "General"}]`,
          timestamp: new Date().toISOString(),
        };
      });
    } else {
      // JSON path
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { success: false, error: "Could not parse response as JSON or CSV" },
          { status: 422 },
        );
      }

      const items = Array.isArray(parsed) ? parsed : [parsed];
      formattedLogs = items.slice(0, 100).map((item: any, idx: number) => ({
        reference: item.reference || item.transactionId || item.id || `url_ref_${Date.now()}_${idx}`,
        source,
        sourceType: (item.sourceType || "PROVIDER_FEED") as any,
        amount: Math.abs(Number(item.amount) || 100),
        currency: item.currency || "INR",
        status: item.status || "completed",
        description: item.description || "URL Dataset Transaction",
        timestamp: item.timestamp || new Date().toISOString(),
      }));
    }

    const ingestResult = await LogIngestor.ingest({
      source,
      sourceType: "BANK_STATEMENT",
      rawFormat: "JSON",
      payload: formattedLogs,
    });

    return NextResponse.json({
      success: true,
      result: {
        source,
        recordsFetched: formattedLogs.length,
        accepted: ingestResult.accepted,
        autoSolved: ingestResult.autoSolved,
        unresolved: ingestResult.unresolved,
        duplicates: ingestResult.duplicates,
        rejected: ingestResult.rejected,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to ingest from URL" },
      { status: 500 },
    );
  }
}
