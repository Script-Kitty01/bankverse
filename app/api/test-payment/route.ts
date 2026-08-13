/**
 * Phase 2 Verification — Payment Orchestrator Test Endpoint
 *
 * GET /api/test-payment — runs all Phase 2 tests and returns results.
 */

import { NextResponse } from "next/server";
import { PaymentOrchestrator } from "@/lib/payment/orchestrator";
import { PaymentStateMachine } from "@/lib/payment/state-machine";
import { MockPaymentProvider } from "@/lib/payment/mock.provider";
import {
  updatePaymentTransactionState,
  verifyLedgerIntegrity,
} from "@/lib/ledger/ledger.service";

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

  // ─── Test 1: State machine — valid transitions ────────────────
  try {
    const t1 = PaymentStateMachine.canTransitionPayment(
      "CREATED",
      "PROCESSING",
    );
    const t2 = PaymentStateMachine.canTransitionPayment(
      "PROCESSING",
      "SUCCESS",
    );
    const t3 = PaymentStateMachine.canTransitionPayment("PROCESSING", "FAILED");
    const t4 = PaymentStateMachine.canTransitionSettlement(
      "NOT_REQUIRED",
      "PENDING_RECONCILIATION",
    );
    const t5 = PaymentStateMachine.canTransitionSettlement(
      "PENDING_RECONCILIATION",
      "RECONCILING",
    );

    const passed =
      t1.allowed && t2.allowed && t3.allowed && t4.allowed && t5.allowed;

    results.push({
      name: "State machine — valid transitions",
      passed,
      details: passed
        ? "All valid transitions allowed: CREATED→PROCESSING, PROCESSING→SUCCESS, PROCESSING→FAILED, NOT_REQUIRED→PENDING_RECONCILIATION, PENDING_RECONCILIATION→RECONCILING"
        : `Failed: ${[t1, t2, t3, t4, t5]
            .filter((t) => !t.allowed)
            .map((t) => t.reason)
            .join("; ")}`,
    });
  } catch (e: any) {
    results.push({
      name: "State machine — valid transitions",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 2: State machine — invalid transitions blocked ──────
  try {
    const t1 = PaymentStateMachine.canTransitionPayment(
      "SUCCESS",
      "PROCESSING",
    );
    const t2 = PaymentStateMachine.canTransitionPayment("FAILED", "SUCCESS");
    const t3 = PaymentStateMachine.canTransitionSettlement(
      "RESOLVED",
      "PENDING_RECONCILIATION",
    );

    const passed = !t1.allowed && !t2.allowed && !t3.allowed;

    results.push({
      name: "State machine — invalid transitions blocked",
      passed,
      details: passed
        ? "All invalid transitions correctly blocked"
        : `Unexpected allowed: ${[t1, t2, t3]
            .filter((t) => t.allowed)
            .map((t) => `${t.from}→${t.to}`)
            .join(", ")}`,
    });
  } catch (e: any) {
    results.push({
      name: "State machine — invalid transitions blocked",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 3: Terminal state detection ─────────────────────────
  try {
    const p1 = PaymentStateMachine.isTerminalPayment("SUCCESS");
    const p2 = PaymentStateMachine.isTerminalPayment("FAILED");
    const p3 = PaymentStateMachine.isTerminalPayment("PROCESSING");
    const s1 = PaymentStateMachine.isTerminalSettlement("RESOLVED");
    const s2 = PaymentStateMachine.isTerminalSettlement("REFUNDED");
    const s3 = PaymentStateMachine.isTerminalSettlement(
      "PENDING_RECONCILIATION",
    );

    const passed = p1 && p2 && !p3 && s1 && s2 && !s3;

    results.push({
      name: "Terminal state detection",
      passed,
      details: passed
        ? "SUCCESS/FAILED terminal for payment, RESOLVED/REFUNDED terminal for settlement"
        : `Payment: SUCCESS=${p1}, FAILED=${p2}, PROCESSING=${p3}. Settlement: RESOLVED=${s1}, REFUNDED=${s2}, PENDING=${s3}`,
    });
  } catch (e: any) {
    results.push({
      name: "Terminal state detection",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 4: Mock provider — create order ─────────────────────
  try {
    const provider = new MockPaymentProvider({ latency: 0, failureRate: 0 });
    const order = await provider.createOrder({ amount: 100, currency: "INR" });

    const passed = order.success && !!order.orderId && order.amount === 100;

    results.push({
      name: "Mock provider — create order",
      passed,
      details: passed
        ? `Created order ${order.orderId} for ${order.amount} ${order.currency}`
        : `Success: ${order.success}, OrderId: ${order.orderId}, Amount: ${order.amount}`,
    });
  } catch (e: any) {
    results.push({
      name: "Mock provider — create order",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 5: Mock provider — verify & capture ─────────────────
  try {
    const provider = new MockPaymentProvider({ latency: 0, failureRate: 0 });
    const verify = await provider.verifyPayment({
      orderId: "test-order",
      paymentId: "test-payment",
      signature: "test-sig",
    });
    const capture = await provider.capturePayment({
      paymentId: "test-payment",
      amount: 100,
      currency: "INR",
    });

    const passed =
      verify.success && capture.success && capture.status === "captured";

    results.push({
      name: "Mock provider — verify & capture",
      passed,
      details: passed
        ? `Verified payment ${verify.paymentId}, captured with status: ${capture.status}`
        : `Verify: ${verify.success}, Capture: ${capture.success}`,
    });
  } catch (e: any) {
    results.push({
      name: "Mock provider — verify & capture",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 6: Orchestrator — full payment flow ─────────────────
  try {
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });
    const result = await orchestrator.processPayment({
      customerId: `cust-${runId}`,
      merchantId: `merch-${runId}`,
      amount: 500,
      currency: "INR",
      method: "upi",
      description: "Test payment via orchestrator",
    });

    const passed =
      result.success &&
      !!result.transaction &&
      result.transaction.paymentState === "SUCCESS";

    results.push({
      name: "Orchestrator — full payment flow",
      passed,
      details: passed
        ? `Payment ${result.transaction!.id} completed: state=${result.transaction!.paymentState}, orderId=${result.orderId}`
        : `Success: ${result.success}, Error: ${result.error}, State: ${result.transaction?.paymentState}`,
    });
  } catch (e: any) {
    results.push({
      name: "Orchestrator — full payment flow",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 7: Orchestrator — idempotency ───────────────────────
  try {
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });
    const idempotencyKey = `idem-${runId}`;

    const first = await orchestrator.processPayment({
      customerId: `cust-idem-${runId}`,
      merchantId: `merch-idem-${runId}`,
      amount: 300,
      currency: "INR",
      method: "card",
      idempotencyKey,
    });

    const second = await orchestrator.processPayment({
      customerId: `cust-idem-${runId}`,
      merchantId: `merch-idem-${runId}`,
      amount: 300,
      currency: "INR",
      method: "card",
      idempotencyKey,
    });

    const passed =
      first.transaction?.id === second.transaction?.id && second.success;

    results.push({
      name: "Orchestrator — idempotency",
      passed,
      details: passed
        ? `Both calls returned transaction ${first.transaction!.id}`
        : `First: ${first.transaction?.id}, Second: ${second.transaction?.id}`,
    });
  } catch (e: any) {
    results.push({
      name: "Orchestrator — idempotency",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 8: Orchestrator — refund flow ───────────────────────
  try {
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });

    // First make a successful payment
    const payment = await orchestrator.processPayment({
      customerId: `cust-refund-${runId}`,
      merchantId: `merch-refund-${runId}`,
      amount: 200,
      currency: "INR",
      method: "upi",
      description: "Refund test payment",
    });

    if (!payment.success || !payment.transaction) {
      throw new Error("Precondition failed: payment not successful");
    }

    // Then refund it
    const refund = await orchestrator.refundPayment({
      transactionId: payment.transaction.id,
      reason: "Test refund",
    });

    const passed = refund.success && !!refund.refundId;

    results.push({
      name: "Orchestrator — refund flow",
      passed,
      details: passed
        ? `Refunded payment ${payment.transaction.id}, refundId=${refund.refundId}`
        : `Refund success: ${refund.success}, Error: ${refund.error}`,
    });
  } catch (e: any) {
    results.push({
      name: "Orchestrator — refund flow",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 9: OCC — 100 concurrent state transitions ───────────
  try {
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });

    const initial = await orchestrator.processPayment({
      customerId: `cust-occ-${runId}`,
      merchantId: `merch-occ-${runId}`,
      amount: 500,
      currency: "INR",
      method: "upi",
      description: "OCC race test",
    });

    if (!initial.success || !initial.transaction) {
      throw new Error("Precondition failed: OCC initial payment failed");
    }

    const txId = initial.transaction.id;
    const initialVersion = initial.transaction.version ?? 1;

    // Fire 100 concurrent update requests with the exact same expectedVersion
    const promises = Array.from({ length: 100 }, (_, i) =>
      updatePaymentTransactionState(
        txId,
        "SUCCESS",
        "PENDING_RECONCILIATION",
        { retryCount: i + 1 },
        initialVersion,
      ),
    );

    const raceResults = await Promise.allSettled(promises);
    const fulfilled = raceResults.filter((r) => r.status === "fulfilled");
    const rejected = raceResults.filter((r) => r.status === "rejected");

    const passed = fulfilled.length === 1 && rejected.length === 99;

    results.push({
      name: "OCC — 100 concurrent state transitions",
      passed,
      details: passed
        ? `100 concurrent transitions executed: 1 winner succeeded, 99 OCC conflicts rejected`
        : `Expected 1 winner & 99 conflicts, got: ${fulfilled.length} succeeded, ${rejected.length} rejected`,
    });
  } catch (e: any) {
    results.push({
      name: "OCC — 100 concurrent state transitions",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 10: Ledger integrity after all operations ───────────
  try {
    const integrity = await verifyLedgerIntegrity();

    results.push({
      name: "Ledger integrity after orchestrator operations",
      passed: integrity.valid,
      details: integrity.valid
        ? `Total debits: ${integrity.totalDebits}, Total credits: ${integrity.totalCredits}, Difference: ${integrity.difference}`
        : `MISMATCH! Debits: ${integrity.totalDebits}, Credits: ${integrity.totalCredits}, Diff: ${integrity.difference}`,
    });
  } catch (e: any) {
    results.push({
      name: "Ledger integrity after orchestrator operations",
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
    phase: "Phase 2 — Payment Orchestrator",
    timestamp: new Date().toISOString(),
    duration: `${duration}ms`,
    summary: `${passed}/${results.length} tests passed`,
    passed,
    failed,
    results,
  });
}
