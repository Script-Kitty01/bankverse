/**
 * BankVerse — Operations API
 *
 * GET  /api/operations  — Get operations snapshot
 * POST /api/operations  — Resolve incident or trigger reconciliation
 */

import { NextResponse } from "next/server";
import { IncidentDetector } from "@/lib/incidents/detector";
import { getAllPaymentTransactions } from "@/lib/ledger/ledger.service";
import { getReconciliationEngine } from "@/lib/reconciliation/engine";
import { MockPaymentProvider } from "@/lib/payment/mock.provider";

export async function GET() {
  try {
    // Fetch all payment transactions
    const transactions = await getAllPaymentTransactions(1000);

    // Run incident detection on transactions
    IncidentDetector.detectFromTransactions(transactions);

    // Get latest reconciliation report
    const engine = getReconciliationEngine({ provider: "razorpay" });
    const report = await engine.runReconciliation({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    });

    // Run incident detection on reconciliation
    IncidentDetector.detectFromReconciliation(report);

    // Check provider health
    const mockProvider = new MockPaymentProvider({ latency: 10, failureRate: 0 });
    const providerHealth: Record<string, boolean> = {
      razorpay: await mockProvider.healthCheck(),
      dwolla: true, // Assume healthy in demo
      plaid: true,
    };

    // Generate snapshot
    const snapshot = IncidentDetector.getOperationsSnapshot(
      transactions,
      report,
      providerHealth,
    );

    return NextResponse.json({ success: true, snapshot });
  } catch (error: any) {
    console.error("Operations API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, incidentId, resolution } = body;

    switch (action) {
      case "resolve-incident": {
        if (!incidentId) {
          return NextResponse.json(
            { success: false, error: "incidentId is required" },
            { status: 400 },
          );
        }
        const updated = IncidentDetector.updateIncident(
          incidentId,
          "RESOLVED",
          resolution || "Resolved by operator",
        );
        if (!updated) {
          return NextResponse.json(
            { success: false, error: "Incident not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({ success: true, incident: updated });
      }

      case "dismiss-incident": {
        if (!incidentId) {
          return NextResponse.json(
            { success: false, error: "incidentId is required" },
            { status: 400 },
          );
        }
        const updated = IncidentDetector.updateIncident(
          incidentId,
          "DISMISSED",
          resolution || "Dismissed by operator",
        );
        if (!updated) {
          return NextResponse.json(
            { success: false, error: "Incident not found" },
            { status: 404 },
          );
        }
        return NextResponse.json({ success: true, incident: updated });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
