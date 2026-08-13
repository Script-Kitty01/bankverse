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

    const { getPaymentTransactionById } = await import(
      "@/lib/ledger/ledger.service"
    );
    const finalTx = await getPaymentTransactionById(txId);
    const expectedFinalVersion = initialVersion + 1;

    const passed =
      fulfilled.length === 1 &&
      rejected.length === 99 &&
      finalTx?.version === expectedFinalVersion;

    results.push({
      name: "OCC — 100 concurrent state transitions",
      passed,
      details: passed
        ? `100 concurrent transitions executed: 1 winner succeeded, 99 OCC conflicts rejected (final version=${finalTx?.version})`
        : `Expected 1 winner & 99 conflicts (version=${expectedFinalVersion}), got: ${fulfilled.length} succeeded, ${rejected.length} rejected, final version=${finalTx?.version}`,
    });
  } catch (e: any) {
    results.push({
      name: "OCC — 100 concurrent state transitions",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 10: OCC & Idempotency — 100 concurrent payment calls ──
  try {
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });
    const raceIdempotencyKey = `race-idem-${runId}`;

    // Fire 100 simultaneous processPayment calls with the EXACT same idempotency key
    const processPromises = Array.from({ length: 100 }, () =>
      orchestrator.processPayment({
        customerId: `cust-race-${runId}`,
        merchantId: `merch-race-${runId}`,
        amount: 1000,
        currency: "INR",
        method: "upi",
        description: "Concurrent processPayment race test",
        idempotencyKey: raceIdempotencyKey,
      }),
    );

    const raceResults = await Promise.all(processPromises);
    const successful = raceResults.filter((r) => r.success);
    const txIds = new Set(successful.map((r) => r.transaction?.id));

    const { getLedgerEntriesByTransaction } = await import(
      "@/lib/ledger/ledger.service"
    );
    const entries = await getLedgerEntriesByTransaction(
      Array.from(txIds)[0] || "",
    );

    // Exactly 2 pairs of ledger entries: Customer -> Clearing (2) + Clearing -> Merchant (2) = 4 entries total
    const passed =
      successful.length === 100 &&
      txIds.size === 1 &&
      entries.length === 4;

    results.push({
      name: "OCC & Idempotency — 100 concurrent payment calls",
      passed,
      details: passed
        ? `100 concurrent requests processed: 100 safe responses, exactly 1 transaction created (${Array.from(txIds)[0]}), exactly 4 ledger entries (Customer→Clearing→Merchant), 0 duplicate movements`
        : `Expected 100 responses with 1 transaction ID & 4 entries, got ${successful.length} successful, ${txIds.size} unique transaction IDs, ${entries.length} ledger entries`,
    });
  } catch (e: any) {
    results.push({
      name: "OCC & Idempotency — 100 concurrent payment calls",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 11: OCC — 100 concurrent financial settlement attempts ──
  try {
    const {
      recordTransaction,
      settleToMerchant,
      getLedgerEntriesByTransaction,
      getPaymentTransactionById,
      getOrCreateLedgerAccount,
      getOrCreateClearingAccount,
      verifyLedgerIntegrity,
    } = await import("@/lib/ledger/ledger.service");

    const customerId = `cust-settle-${runId}`;
    const merchantId = `merch-settle-${runId}`;

    // 1. Record Customer -> Clearing transaction (captured, NOT yet settled)
    const ledgerResult = await recordTransaction({
      customerId,
      merchantId,
      amount: 7500,
      currency: "INR",
      provider: "mock",
      providerReference: `ref-settle-${runId}`,
      idempotencyKey: `idem-settle-${runId}`,
      description: "Concurrent settlement OCC race test",
    });

    const txId = ledgerResult.transaction.id;
    const initialVersion = ledgerResult.transaction.version ?? 1;

    // 2. Fire 100 concurrent settlement attempts with expectedVersion = initialVersion
    const settlePromises = Array.from({ length: 100 }, () =>
      settleToMerchant(txId, initialVersion),
    );

    const settleResults = await Promise.allSettled(settlePromises);
    const fulfilled = settleResults.filter((r) => r.status === "fulfilled");
    const rejected = settleResults.filter((r) => r.status === "rejected");

    // 3. Fetch updated transaction state & verify version and settlement state
    const updatedTx = await getPaymentTransactionById(txId);
    const updatedVersion = updatedTx?.version;
    const settlementState = updatedTx?.settlementState;

    // 4. Fetch ledger entries for transaction
    const entries = await getLedgerEntriesByTransaction(txId);
    const settlementEntries = entries.filter((e) =>
      e.description.startsWith("SETTLEMENT:"),
    );
    const clearingDebits = settlementEntries.filter(
      (e) => e.entryType === "DEBIT",
    );
    const merchantCredits = settlementEntries.filter(
      (e) => e.entryType === "CREDIT",
    );

    // 5. Fetch account-level financial state & verify derived balances
    const customerAccount = await getOrCreateLedgerAccount(
      customerId,
      "INR",
      "CUSTOMER",
    );
    const clearingAccount = await getOrCreateClearingAccount("INR");
    const merchantAccount = await getOrCreateLedgerAccount(
      merchantId,
      "INR",
      "MERCHANT",
    );

    // Verify double-entry balance across full ledger
    const integrity = await verifyLedgerIntegrity();

    const passed =
      fulfilled.length === 1 &&
      rejected.length === 99 &&
      updatedVersion === initialVersion + 1 &&
      settlementState === "RESOLVED" &&
      entries.length === 4 &&
      settlementEntries.length === 2 &&
      clearingDebits.length === 1 &&
      merchantCredits.length === 1 &&
      clearingDebits[0].amount === 7500 &&
      merchantCredits[0].amount === 7500 &&
      customerAccount.totalDebits === 7500 &&
      customerAccount.derivedBalance === -7500 &&
      clearingAccount.totalDebits >= 7500 &&
      clearingAccount.totalCredits >= 7500 &&
      merchantAccount.totalCredits === 7500 &&
      merchantAccount.derivedBalance === 7500 &&
      integrity.valid;

    results.push({
      name: "OCC — 100 concurrent financial settlement attempts",
      passed,
      details: passed
        ? `100 concurrent settlements executed: 1 winner succeeded, 99 OCC conflicts rejected, version bumped ${initialVersion} → ${updatedVersion}, settlementState=RESOLVED, customer=-₹7,500, clearing net=₹0, merchant=+₹7,500, exactly 4 ledger entries, ledger balanced.`
        : `Assertion failed: fulfilled=${fulfilled.length}, rejected=${rejected.length}, version=${updatedVersion} (expected ${initialVersion + 1}), state=${settlementState}, totalEntries=${entries.length}, settlementEntries=${settlementEntries.length}, merchantBalance=${merchantAccount.derivedBalance}, balanced=${integrity.valid}`,
    });
  } catch (e: any) {
    results.push({
      name: "OCC — 100 concurrent financial settlement attempts",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 12: Atomic Rollback — Partial Mutation Failure Recovery ─
  try {
    const {
      recordTransaction,
      settleToMerchant,
      getLedgerEntriesByTransaction,
      getPaymentTransactionById,
      verifyLedgerIntegrity,
    } = await import("@/lib/ledger/ledger.service");

    const customerId = `cust-rollback-${runId}`;
    const merchantId = `merch-rollback-${runId}`;

    const ledgerResult = await recordTransaction({
      customerId,
      merchantId,
      amount: 5000,
      currency: "INR",
      provider: "mock",
      providerReference: `ref-rollback-${runId}`,
      idempotencyKey: `idem-rollback-${runId}`,
      description: "Atomic rollback failure injection test",
    });

    const txId = ledgerResult.transaction.id;
    const initialTx = await getPaymentTransactionById(txId);

    // Inject middle-of-mutation failure: Payment updated ✓ → Clearing DEBIT ✓ → 💥 Merchant CREDIT failure
    let threwSimulatedError = false;
    try {
      await settleToMerchant(txId, initialTx?.version, {
        simulateFailureStage: "MERCHANT_CREDIT_FAIL",
      });
    } catch (err: unknown) {
      threwSimulatedError =
        err instanceof Error &&
        err.message === "SIMULATED_MERCHANT_CREDIT_FAILURE";
    }

    const postTx = await getPaymentTransactionById(txId);
    const postEntries = await getLedgerEntriesByTransaction(txId);
    const postSettlementEntries = postEntries.filter((e) =>
      e.description.startsWith("SETTLEMENT:"),
    );
    const integrity = await verifyLedgerIntegrity();

    const passed =
      threwSimulatedError &&
      postTx?.version === initialTx?.version &&
      postTx?.settlementState === initialTx?.settlementState &&
      postSettlementEntries.length === 0 &&
      postEntries.length === 2 &&
      integrity.valid;

    results.push({
      name: "Atomic Rollback — Partial Mutation Failure Recovery",
      passed,
      details: passed
        ? `Mid-mutation settlement failure (Clearing DEBIT ✓ → Merchant CREDIT 💥) safely caught & rolled back: payment version (${postTx?.version}) and settlementState (${postTx?.settlementState}) unchanged, 0 orphan settlement entries, ledger balanced.`
        : `Rollback verification failed: threwError=${threwSimulatedError}, version=${postTx?.version}, settlementEntries=${postSettlementEntries.length}`,
    });
  } catch (e: any) {
    results.push({
      name: "Atomic Rollback — Partial Mutation Failure Recovery",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 13: Idempotency Key Reuse with Hash Mismatch Rejection ─
  try {
    const { IdempotencyManager } = await import("@/lib/security/idempotency");

    const idempotencyKey = `idem-hash-test-${runId}`;
    const initialParams = { customerId: "cust_1", amount: 1000, currency: "INR" };
    const alteredParams = { customerId: "cust_1", amount: 9000, currency: "INR" };

    const mockTx = {
      id: "ptx_mock_1",
      customerId: "cust_1",
      merchantId: "merch_1",
      amount: 1000,
      currency: "INR",
      paymentState: "SUCCESS" as const,
      settlementState: "NOT_REQUIRED" as const,
      provider: "mock",
      providerReference: "ref_1",
      idempotencyKey,
      retryCount: 0,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Cache original result with initialParams
    await IdempotencyManager.cacheResult(
      idempotencyKey,
      { transaction: mockTx, cachedAt: new Date().toISOString() },
      initialParams,
    );

    // Query with identical params -> should succeed
    const sameResult = await IdempotencyManager.getResult(
      idempotencyKey,
      initialParams,
    );

    // Query with altered params -> should throw IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST
    let rejectedDifferentParams = false;
    try {
      await IdempotencyManager.getResult(idempotencyKey, alteredParams);
    } catch (err: unknown) {
      rejectedDifferentParams =
        err instanceof Error &&
        err.message === "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST";
    }

    const passed = sameResult !== null && rejectedDifferentParams;

    results.push({
      name: "Idempotency Key Reuse with Hash Mismatch Rejection",
      passed,
      details: passed
        ? `Identical request payload returned cached response; altered request payload with same idempotency key was correctly rejected (IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST).`
        : `Assertion failed: sameResult=${!!sameResult}, rejectedDifferentParams=${rejectedDifferentParams}`,
    });
  } catch (e: any) {
    results.push({
      name: "Idempotency Key Reuse with Hash Mismatch Rejection",
      passed: false,
      details: "Threw unexpected error",
      error: e.message,
    });
  }

  // ─── Test 14: Ledger integrity after all operations ───────────
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
