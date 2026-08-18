/**
 * BankVerse — Query Transaction Logs API
 *
 * GET /api/logs — Query, search, and paginate ingested transaction logs
 */

import { NextResponse } from "next/server";
import { queryLogs, clearLogStore } from "@/lib/ingestion/store";
import type { ChaosCategory, ResolutionStatus } from "@/lib/ingestion/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const category = (searchParams.get("category") || undefined) as
      | ChaosCategory
      | undefined;
    const source = searchParams.get("source") || undefined;
    const resolutionStatus = (searchParams.get("resolutionStatus") ||
      undefined) as ResolutionStatus | undefined;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = queryLogs({
      category,
      source,
      resolutionStatus,
      search,
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query logs" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    clearLogStore();
    return NextResponse.json({
      success: true,
      message: "All logs cleared",
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to clear logs" },
      { status: 500 },
    );
  }
}
