/**
 * BankVerse — Reconciliation API
 *
 * POST /api/reconciliation — trigger a reconciliation run
 * GET /api/reconciliation — get the latest reconciliation report
 */

import { NextRequest, NextResponse } from "next/server";
import { getReconciliationEngine } from "@/lib/reconciliation/engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const dateRange = {
      start:
        body.start ||
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: body.end || new Date().toISOString(),
    };

    const engine = getReconciliationEngine();
    const report = await engine.runReconciliation(dateRange);

    return NextResponse.json({
      success: report.run.status === "COMPLETED",
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Reconciliation failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const engine = getReconciliationEngine();
    const dateRange = {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    };
    const report = await engine.runReconciliation(dateRange);

    return NextResponse.json({
      success: report.run.status === "COMPLETED",
      report,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Reconciliation failed" },
      { status: 500 },
    );
  }
}
