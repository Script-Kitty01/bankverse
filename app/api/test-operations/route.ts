/**
 * BankVerse — Phase 5: Operations Dashboard & Incidents Verification
 *
 * GET /api/test-operations — Tests incident detection, operations snapshot, and API.
 */

import { NextResponse } from "next/server";
import { IncidentDetector, type PaymentIncident } from "@/lib/incidents/detector";
import { IncidentCorrelator } from "@/lib/incidents/correlator";
import { getAllPaymentTransactions } from "@/lib/ledger/ledger.service";
import { getReconciliationEngine } from "@/lib/reconciliation/engine";
import { MockPaymentProvider } from "@/lib/payment/mock.provider";

export async function GET() {
  const results: Record<string, any> = {};
  let passed = 0;
  let failed = 0;

  // Test 1: Incident detection from transactions
  try {
    const transactions = await getAllPaymentTransactions(1000);
    const incidents = IncidentDetector.detectFromTransactions(transactions);
    results["incident-detection"] = {
      name: "Incident Detection from Transactions",
      passed: true,
      actualBehavior: `Detected ${incidents.length} incidents from ${transactions.length} transactions`,
    };
    passed++;
  } catch (e: any) {
    results["incident-detection"] = {
      name: "Incident Detection from Transactions",
      passed: false,
      actualBehavior: `Error: ${e.message}`,
    };
    failed++;
  }

  // Test 2: Reconciliation-based incident detection
  try {
    const engine = getReconciliationEngine({ provider: "razorpay" });
    const report = await engine.runReconciliation({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    });
    const incidents = IncidentDetector.detectFromReconciliation(report);
    results["recon-incident-detection"] = {
      name: "Reconciliation Incident Detection",
      passed: true,
      actualBehavior: `Detected ${incidents.length} incidents from reconciliation (${report.items.length} items, match rate: ${(report.summary.matchRate * 100).toFixed(0)}%)`,
    };
    passed++;
  } catch (e: any) {
    results["recon-incident-detection"] = {
      name: "Reconciliation Incident Detection",
      passed: false,
      actualBehavior: `Error: ${e.message}`,
    };
    failed++;
  }

  // Test 3: Operations snapshot generation
  try {
    const transactions = await getAllPaymentTransactions(1000);
    const engine = getReconciliationEngine({ provider: "razorpay" });
    const report = await engine.runReconciliation({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    });
    const mockProvider = new MockPaymentProvider({ latency: 10, failureRate: 0 });
    const providerHealth = {
      razorpay: await mockProvider.healthCheck(),
      dwolla: true,
      plaid: true,
    };

    const snapshot = IncidentDetector.getOperationsSnapshot(
      transactions,
      report,
      providerHealth,
    );

    const valid =
      snapshot.totalTransactions >= 0 &&
      snapshot.successRate >= 0 &&
      snapshot.successRate <= 1 &&
      typeof snapshot.activeIncidents === "number";

    results["operations-snapshot"] = {
      name: "Operations Snapshot",
      passed: valid,
      actualBehavior: valid
        ? `Snapshot valid: ${snapshot.totalTransactions} txs, ${(snapshot.successRate * 100).toFixed(0)}% success, ${snapshot.activeIncidents} active incidents`
        : "Snapshot validation failed",
    };
    if (valid) passed++;
    else failed++;
  } catch (e: any) {
    results["operations-snapshot"] = {
      name: "Operations Snapshot",
      passed: false,
      actualBehavior: `Error: ${e.message}`,
    };
    failed++;
  }

  // Test 4: Incident lifecycle (detect → resolve)
  try {
    const transactions = await getAllPaymentTransactions(1000);
    IncidentDetector.detectFromTransactions(transactions);
    const activeIncidents = IncidentDetector.getActiveIncidents();

    if (activeIncidents.length > 0) {
      const resolved = IncidentDetector.updateIncident(
        activeIncidents[0].id,
        "RESOLVED",
        "Test resolution",
      );
      const stillActive = IncidentDetector.getActiveIncidents();

      results["incident-lifecycle"] = {
        name: "Incident Lifecycle (detect → resolve)",
        passed: resolved !== null && stillActive.length < activeIncidents.length,
        actualBehavior:
          resolved !== null
            ? `Resolved incident ${activeIncidents[0].id}, active count: ${activeIncidents.length} → ${stillActive.length}`
            : "Failed to resolve incident",
      };
      if (resolved !== null) passed++;
      else failed++;
    } else {
      results["incident-lifecycle"] = {
        name: "Incident Lifecycle (detect → resolve)",
        passed: true,
        actualBehavior: "No incidents to resolve (all clear)",
      };
      passed++;
    }
  } catch (e: any) {
    results["incident-lifecycle"] = {
      name: "Incident Lifecycle",
      passed: false,
      actualBehavior: `Error: ${e.message}`,
    };
    failed++;
  }

  // Test 5: Operations API endpoint
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/operations`);
    const data = await res.json();

    results["operations-api"] = {
      name: "Operations API Endpoint",
      passed: data.success === true && data.snapshot !== undefined,
      actualBehavior: data.success
        ? `API returned snapshot with ${data.snapshot.totalTransactions} txs`
        : `API error: ${data.error}`,
    };
    if (data.success) passed++;
    else failed++;
  } catch (e: any) {
    results["operations-api"] = {
      name: "Operations API Endpoint",
      passed: false,
      actualBehavior: `Error: ${e.message}`,
    };
    failed++;
  }

  // Test 6: Provider health check
  try {
    const mockProvider = new MockPaymentProvider({ latency: 10, failureRate: 0 });
    const healthy = await mockProvider.healthCheck();
    const unhealthyProvider = new MockPaymentProvider({ latency: 10, failureRate: 1.0 });
    const unhealthy = await unhealthyProvider.healthCheck();

    results["provider-health"] = {
      name: "Provider Health Check",
      passed: healthy === true && unhealthy === false,
      actualBehavior: `Healthy provider: ${healthy}, Unhealthy provider: ${unhealthy}`,
    };
    if (healthy && !unhealthy) passed++;
    else failed++;
  } catch (e: any) {
    results["provider-health"] = {
      name: "Provider Health Check",
      passed: false,
      actualBehavior: `Error: ${e.message}`,
    };
    failed++;
  }

  // Test 7: Incident correlation — same provider+type+window merges
  try {
    const now = new Date().toISOString();
    const baseIncident: PaymentIncident = {
      id: "inc_corr_test_1",
      title: "AMOUNT_MISMATCH on razorpay — 5 items",
      severity: "HIGH",
      status: "DETECTED",
      provider: "razorpay",
      paymentMethod: "upi",
      bank: "hdfc",
      affectedTransactionCount: 5,
      totalAffectedAmount: 5000,
      mismatchTypes: ["AMOUNT_MISMATCH"],
      reconciliationItemIds: ["r1", "r2", "r3", "r4", "r5"],
      detectedAt: now,
      resolvedAt: null,
      resolution: null,
      timeline: [
        { timestamp: now, event: "DETECTED", detail: "Test detection" },
      ],
    };

    // First incident stands alone
    const result1 = IncidentCorrelator.correlate(baseIncident, []);
    const standalone = !result1.wasMerged;

    // Second incident with same provider+type+window should merge
    const similarIncident: PaymentIncident = {
      ...baseIncident,
      id: "inc_corr_test_2",
      affectedTransactionCount: 1200,
      totalAffectedAmount: 500000,
      reconciliationItemIds: ["r6"],
    };
    const result2 = IncidentCorrelator.correlate(similarIncident, [baseIncident]);
    const merged = result2.wasMerged && result2.mergedIntoId === "inc_corr_test_1";
    const escalated = result2.incident.affectedTransactionCount === 1205; // 5 + 1200
    const amountSum = result2.incident.totalAffectedAmount === 505000; // 5000 + 500000

    // Third incident with different provider should NOT merge
    const differentProvider: PaymentIncident = {
      ...baseIncident,
      id: "inc_corr_test_3",
      provider: "dwolla",
    };
    const result3 = IncidentCorrelator.correlate(differentProvider, [
      baseIncident,
    ]);
    const notMerged = !result3.wasMerged;

    const allPassed = standalone && merged && escalated && amountSum && notMerged;

    results["incident-correlation"] = {
      name: "Incident Correlation (same provider+type+window merges)",
      passed: allPassed,
      actualBehavior: allPassed
        ? `Standalone: ${standalone}, Merged: ${merged}, Count escalated: ${escalated} (1205), Amount summed: ${amountSum} (505000), Different provider not merged: ${notMerged}`
        : `Standalone=${standalone} Merged=${merged} Escalated=${escalated} Amount=${amountSum} NotMerged=${notMerged}`,
    };
    if (allPassed) passed++;
    else failed++;
  } catch (e: any) {
    results["incident-correlation"] = {
      name: "Incident Correlation",
      passed: false,
      actualBehavior: `Error: ${e.message}`,
    };
    failed++;
  }

  return NextResponse.json({
    phase: 5,
    name: "Operations Dashboard & Incidents",
    total: Object.keys(results).length,
    passed,
    failed,
    passRate: Object.keys(results).length > 0 ? passed / Object.keys(results).length : 0,
    results,
  });
}
