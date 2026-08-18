/**
 * Verification Suite — Transaction Log Ingestion & Auto-Solve Engine
 *
 * GET /api/test-ingest — Runs verification tests for classification, policies,
 * deduplication, CSV parsing, auto-solve execution, and reconciliation integration.
 */

import { NextResponse } from "next/server";
import { LogIngestor } from "@/lib/ingestion/ingestor";
import { classifyLog } from "@/lib/ingestion/classifier";
import { updatePolicy, resetPolicies } from "@/lib/ingestion/policies";
import { clearLogStore } from "@/lib/ingestion/store";
import { ReconciliationEngine } from "@/lib/reconciliation/engine";
import type { ChaosCategory } from "@/lib/ingestion/types";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

export async function GET() {
  const results: TestResult[] = [];
  const startTime = Date.now();
  resetPolicies();
  clearLogStore();

  // ─── Test 1: Classification into all 9 fault categories ───────
  try {
    const testCases: { input: Record<string, unknown>; expectedCategory: ChaosCategory }[] = [
      { input: { status: "504_gateway_timeout" }, expectedCategory: "provider-timeout" },
      { input: { status: "amount_mismatch_delta" }, expectedCategory: "amount-mismatch" },
      { input: { status: "double_charge_detected" }, expectedCategory: "duplicate-charge" },
      { input: { status: "debit_without_credit" }, expectedCategory: "missing-credit" },
      { input: { status: "out_of_order_webhook" }, expectedCategory: "webhook-out-of-order" },
      { input: { status: "503_service_unavailable" }, expectedCategory: "provider-down" },
      { input: { status: "bulk_mismatch_batch" }, expectedCategory: "slow-reconciliation" },
      { input: { status: "worker_crash_post_commit" }, expectedCategory: "worker-crash-after-commit" },
      { input: { status: "refund_before_capture" }, expectedCategory: "refund-race-condition" },
    ];

    let allMatched = true;
    for (const tc of testCases) {
      const category = classifyLog(tc.input);
      if (category !== tc.expectedCategory) {
        allMatched = false;
        break;
      }
    }

    results.push({
      name: "9-Category Classification Engine",
      passed: allMatched,
      details: allMatched
        ? "Classified test payloads accurately across all 9 fault categories"
        : "Failed to classify one or more payloads into expected category",
    });
  } catch (e: any) {
    results.push({
      name: "9-Category Classification Engine",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 2: Auto-solve policy execution (Toggle ON) ─────────
  try {
    clearLogStore();
    updatePolicy("provider-timeout", true);

    const ingestRes = await LogIngestor.ingest({
      source: "razorpay",
      payload: [
        {
          reference: "auto_solve_001",
          category: "provider-timeout",
          amount: 1000,
          currency: "INR",
          status: "timeout",
        },
      ],
    });

    const log = ingestRes.logs[0];
    const passed =
      ingestRes.accepted === 1 &&
      ingestRes.autoSolved === 1 &&
      log &&
      log.resolutionStatus === "AUTO_SOLVED";

    results.push({
      name: "Auto-Solve Policy Execution (Toggle ON)",
      passed,
      details: passed
        ? `Log ${log.externalRef} auto-solved by policy (${log.resolutionDetails})`
        : `Resolution status: ${log?.resolutionStatus}`,
    });
  } catch (e: any) {
    results.push({
      name: "Auto-Solve Policy Execution (Toggle ON)",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 3: Manual review flagging (Toggle OFF) ───────────────
  try {
    updatePolicy("missing-credit", false);

    const ingestRes = await LogIngestor.ingest({
      source: "bank-statement",
      payload: [
        {
          reference: "manual_review_002",
          category: "missing-credit",
          amount: 2000,
          currency: "INR",
          status: "debit_without_credit",
        },
      ],
    });

    const log = ingestRes.logs[0];
    const passed =
      ingestRes.unresolved === 1 &&
      log &&
      log.resolutionStatus === "UNRESOLVED";

    results.push({
      name: "Manual Review Flagging (Toggle OFF)",
      passed,
      details: passed
        ? `Log ${log.externalRef} flagged UNRESOLVED for manual review`
        : `Resolution status: ${log?.resolutionStatus}`,
    });
  } catch (e: any) {
    results.push({
      name: "Manual Review Flagging (Toggle OFF)",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 4: Deduplication via SHA-256 Hash ───────────────────
  try {
    const payload = {
      reference: "dedupe_test_003",
      source: "dwolla",
      amount: 1500,
      currency: "INR",
      status: "normal",
      timestamp: new Date().toISOString(),
    };

    const firstRes = await LogIngestor.ingest({ source: "dwolla", payload: [payload] });
    const secondRes = await LogIngestor.ingest({ source: "dwolla", payload: [payload] });

    const passed =
      firstRes.accepted === 1 &&
      secondRes.duplicates === 1 &&
      secondRes.logs[0]?.ingestStatus === "DUPLICATE";

    results.push({
      name: "SHA-256 Hash Deduplication",
      passed,
      details: passed
        ? "First ingestion accepted, second identical payload flagged as DUPLICATE"
        : `First accepted: ${firstRes.accepted}, Second duplicates: ${secondRes.duplicates}`,
    });
  } catch (e: any) {
    results.push({
      name: "SHA-256 Hash Deduplication",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 5: CSV Bank Statement Ingestion ─────────────────────
  try {
    const csvContent = `reference,source,category,amount,currency,status
csv_ref_101,bank-statement,amount-mismatch,1500,INR,mismatch
csv_ref_102,bank-statement,duplicate-charge,3000,INR,duplicate`;

    const ingestRes = await LogIngestor.ingest({
      source: "bank-statement",
      rawFormat: "CSV",
      payload: csvContent,
    });

    const passed = ingestRes.total === 2 && ingestRes.accepted === 2;

    results.push({
      name: "CSV Bank Statement Ingestion",
      passed,
      details: passed
        ? `Parsed and ingested ${ingestRes.accepted} records from CSV content`
        : `Total: ${ingestRes.total}, Accepted: ${ingestRes.accepted}`,
    });
  } catch (e: any) {
    results.push({
      name: "CSV Bank Statement Ingestion",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 6: Reconciliation Engine Integration ───────────────
  try {
    const engine = new ReconciliationEngine({ provider: "razorpay" });
    const report = await engine.runReconciliation({
      start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    });

    const passed = report.run.status === "COMPLETED";

    results.push({
      name: "Reconciliation Engine Ingest Integration",
      passed,
      details: passed
        ? `Reconciliation engine executed successfully consuming ingested log store (${report.run.totalItems} items evaluated)`
        : `Run status: ${report.run.status}`,
    });
  } catch (e: any) {
    results.push({
      name: "Reconciliation Engine Ingest Integration",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  // ─── Test 7: Policy Toggle API Endpoint ───────────────────────
  try {
    const { POST: postPolicies } = await import("@/app/api/logs/policies/route");

    const req = new Request("http://localhost/api/logs/policies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: "amount-mismatch", enabled: false }),
    });

    const res = await postPolicies(req);
    const data = await res.json();

    const passed = data.success && data.policy && data.policy.enabled === false;

    results.push({
      name: "Policy Toggle API Endpoint",
      passed,
      details: passed
        ? "Successfully updated amount-mismatch auto-solve toggle via API"
        : `Success: ${data.success}, Enabled: ${data.policy?.enabled}`,
    });
  } catch (e: any) {
    results.push({
      name: "Policy Toggle API Endpoint",
      passed: false,
      details: "Unexpected error",
      error: e.message,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const duration = Date.now() - startTime;

  return NextResponse.json({
    phase: "Phase 6 — Transaction Log Ingestion & Auto-Solve Engine",
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary: `${passedCount}/${results.length} tests passed`,
    passed: passedCount,
    failed: failedCount,
    results,
  });
}
