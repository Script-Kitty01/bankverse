/**
 * BankVerse — Ingestion Stats API
 *
 * GET /api/logs/stats — Ingestion metrics, auto-solve rates, and category distribution
 */

import { NextResponse } from "next/server";
import { getIngestionStats } from "@/lib/ingestion/store";

export async function GET() {
  try {
    const stats = getIngestionStats();
    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
