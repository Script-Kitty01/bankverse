/**
 * BankVerse — Transaction Log Ingest API
 *
 * POST /api/logs/ingest — Bulk ingest transaction logs (JSON or CSV)
 */

import { NextResponse } from "next/server";
import { LogIngestor } from "@/lib/ingestion/ingestor";
import { readJsonBody } from "@/lib/security/request";
import type { IngestBatchRequest } from "@/lib/ingestion/types";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let requestPayload: IngestBatchRequest;

    if (contentType.includes("text/csv")) {
      const csvText = await request.text();
      requestPayload = {
        source: "bank-statement",
        sourceType: "BANK_STATEMENT",
        rawFormat: "CSV",
        payload: csvText,
      };
    } else {
      const parsed = await readJsonBody<IngestBatchRequest>(request);
      if (!parsed.ok) {
        return NextResponse.json(
          { success: false, error: parsed.error },
          { status: 400 },
        );
      }
      requestPayload = parsed.data;
    }

    const result = await LogIngestor.ingest(requestPayload);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to ingest logs" },
      { status: 500 },
    );
  }
}
