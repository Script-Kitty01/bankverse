/**
 * Phase 3 Verification — Reconciliation Engine Test Endpoint
 *
 * GET /api/test-reconciliation — runs all Phase 3 tests and returns results.
 */

import { NextResponse } from "next/server";
import { ReconciliationMatcher } from "@/lib/reconciliation/matcher";
import { ReconciliationEngine } from "@/lib/reconciliation/engine";
import { PaymentOrchestrator } from "@/lib/payment/orchestrator";
import type { ExternalRecord } from "@/lib/reconciliation/types";
import type { PaymentTransaction } from "@/lib/ledger/types";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

export async function GET() {
  const results: TestResult[] = [];
  const startTime = Date.now();
  const runId = Date.now();

  // ─── Test 1: Exact match by provider reference ────────────────
  try {
    const matcher = new ReconciliationMatcher();

    const internalTxs: PaymentTransaction[] = [
      {
        id: "tx-1",
        customerId: "cust-1",
        merchantId: "merch-1",
        amount: 1000,
        currency: "INR",
        paymentState: "SUCCESS",
        settlementState: "NOT_REQUIRED",
        provider: "razorpay",
        providerReference: "ref-abc-123",
        idempotencyKey: "idem-1",
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const externalRecords: ExternalRecord[] = [
      {
        reference: "ref-abc-123",
        amount: 1000,
        currency: "INR",
        timestamp: new Date().toISOString(),
        status: "settled",
      },
    ];

    const { items } = matcher.match(internalTxs, externalRecords, "run-1");

    const passed =
      items.length === 1 &&
      items[0].matchStatus === "MATCHED" &&
      items[0].matchMethod === "EXACT";

    results.push({
      name: "Exact match by provider reference",
      passed,
      details: passed
        ? `Matched ${items[0].internalTransactionId} ↔ ${items[0].externalReference}`
        : `Status: ${items[0]?.matchStatus}, Method: ${items[0]?.matchMethod}`,
    });
  } catch (e: any) {
    results.push({
      name: "Exact match by provider reference",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 2: Amount mismatch detection ────────────────────────
  try {
    const matcher = new ReconciliationMatcher();

    const internalTxs: PaymentTransaction[] = [
      {
        id: "tx-2",
        customerId: "cust-2",
        merchantId: "merch-2",
        amount: 500,
        currency: "INR",
        paymentState: "SUCCESS",
        settlementState: "NOT_REQUIRED",
        provider: "razorpay",
        providerReference: "ref-def-456",
        idempotencyKey: "idem-2",
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const externalRecords: ExternalRecord[] = [
      {
        reference: "ref-def-456",
        amount: 600, // MISMATCH: internal 500 vs external 600
        currency: "INR",
        timestamp: new Date().toISOString(),
        status: "settled",
      },
    ];

    const { items } = matcher.match(internalTxs, externalRecords, "run-2");

    const passed =
      items.length === 1 &&
      items[0].matchStatus === "MISMATCHED" &&
      items[0].mismatchType === "AMOUNT_MISMATCH" &&
      items[0].difference === -100;

    results.push({
      name: "Amount mismatch detection",
      passed,
      details: passed
        ? `Detected mismatch: internal=500, external=600, diff=-100`
        : `Status: ${items[0]?.matchStatus}, Type: ${items[0]?.mismatchType}, Diff: ${items[0]?.difference}`,
    });
  } catch (e: any) {
    results.push({
      name: "Amount mismatch detection",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 3: Missing external record ──────────────────────────
  try {
    const matcher = new ReconciliationMatcher();

    const internalTxs: PaymentTransaction[] = [
      {
        id: "tx-3",
        customerId: "cust-3",
        merchantId: "merch-3",
        amount: 300,
        currency: "INR",
        paymentState: "SUCCESS",
        settlementState: "NOT_REQUIRED",
        provider: "razorpay",
        providerReference: "ref-ghi-789",
        idempotencyKey: "idem-3",
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const externalRecords: ExternalRecord[] = []; // No external records

    const { items } = matcher.match(internalTxs, externalRecords, "run-3");

    const passed =
      items.length === 1 &&
      items[0].matchStatus === "UNMATCHED" &&
      items[0].mismatchType === "MISSING_EXTERNAL";

    results.push({
      name: "Missing external record detection",
      passed,
      details: passed
        ? `Correctly flagged as MISSING_EXTERNAL`
        : `Status: ${items[0]?.matchStatus}, Type: ${items[0]?.mismatchType}`,
    });
  } catch (e: any) {
    results.push({
      name: "Missing external record detection",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 4: Missing internal record ──────────────────────────
  try {
    const matcher = new ReconciliationMatcher();

    const internalTxs: PaymentTransaction[] = []; // No internal transactions

    const externalRecords: ExternalRecord[] = [
      {
        reference: "ref-jkl-012",
        amount: 700,
        currency: "INR",
        timestamp: new Date().toISOString(),
        status: "settled",
      },
    ];

    const { items } = matcher.match(internalTxs, externalRecords, "run-4");

    const passed =
      items.length === 1 &&
      items[0].matchStatus === "UNMATCHED" &&
      items[0].mismatchType === "MISSING_INTERNAL";

    results.push({
      name: "Missing internal record detection",
      passed,
      details: passed
        ? `Correctly flagged as MISSING_INTERNAL`
        : `Status: ${items[0]?.matchStatus}, Type: ${items[0]?.mismatchType}`,
    });
  } catch (e: any) {
    results.push({
      name: "Missing internal record detection",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 5: Fuzzy match by amount + time ─────────────────────
  try {
    const matcher = new ReconciliationMatcher({
      amountTolerance: 10,
      timeWindowMs: 60 * 60 * 1000, // 1 hour
    });

    const now = new Date().toISOString();
    const internalTxs: PaymentTransaction[] = [
      {
        id: "tx-5",
        customerId: "cust-5",
        merchantId: "merch-5",
        amount: 1000,
        currency: "INR",
        paymentState: "SUCCESS",
        settlementState: "NOT_REQUIRED",
        provider: "razorpay",
        providerReference: "ref-different-name",
        idempotencyKey: "idem-5",
        retryCount: 0,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const externalRecords: ExternalRecord[] = [
      {
        reference: "ext-ref-completely-different",
        amount: 1005, // within tolerance
        currency: "INR",
        timestamp: now, // same time
        status: "settled",
      },
    ];

    const { items } = matcher.match(internalTxs, externalRecords, "run-5");

    const passed =
      items.length === 1 &&
      items[0].matchStatus === "MATCHED" &&
      items[0].matchMethod === "FUZZY";

    results.push({
      name: "Fuzzy match by amount + time window",
      passed,
      details: passed
        ? `Fuzzy matched ${items[0].internalTransactionId} ↔ ${items[0].externalReference}`
        : `Status: ${items[0]?.matchStatus}, Method: ${items[0]?.matchMethod}`,
    });
  } catch (e: any) {
    results.push({
      name: "Fuzzy match by amount + time window",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 6: Full reconciliation engine run ───────────────────
  try {
    // First create some payments via orchestrator
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });

    await orchestrator.processPayment({
      customerId: `rec-cust-1-${runId}`,
      merchantId: `rec-merch-1-${runId}`,
      amount: 100,
      currency: "INR",
      method: "upi",
      description: "Reconciliation test 1",
    });

    await orchestrator.processPayment({
      customerId: `rec-cust-2-${runId}`,
      merchantId: `rec-merch-2-${runId}`,
      amount: 200,
      currency: "INR",
      method: "card",
      description: "Reconciliation test 2",
    });

    // Run reconciliation
    const engine = new ReconciliationEngine({ provider: "razorpay" });
    const report = await engine.runReconciliation({
      start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    });

    const passed =
      report.run.status === "COMPLETED" &&
      report.items.length >= 2 &&
      report.summary.matchRate === 1; // All should match in demo mode

    results.push({
      name: "Full reconciliation engine run",
      passed,
      details: passed
        ? `Reconciled ${report.items.length} items, match rate: ${(report.summary.matchRate * 100).toFixed(0)}%, net diff: ${report.summary.netDifference}`
        : `Status: ${report.run.status}, Items: ${report.items.length}, Match rate: ${report.summary.matchRate}`,
    });
  } catch (e: any) {
    results.push({
      name: "Full reconciliation engine run",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 7: Reconciliation API endpoint ──────────────────────
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const response = await fetch(`${baseUrl}/api/reconciliation`);
    const data = await response.json();

    const passed =
      data.success && data.report && data.report.run.status === "COMPLETED";

    results.push({
      name: "Reconciliation API endpoint",
      passed,
      details: passed
        ? `API returned report with ${data.report.items.length} items`
        : `Success: ${data.success}, Error: ${data.error || "N/A"}`,
    });
  } catch (e: any) {
    results.push({
      name: "Reconciliation API endpoint",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Summary ──────────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const duration = Date.now() - startTime;

  return NextResponse.json({
    phase: "Phase 3 — Reconciliation Engine",
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary: `${passed}/${results.length} tests passed`,
    passed,
    failed,
    results,
  });
}
