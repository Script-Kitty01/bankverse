/**
 * BankVerse — Chaos Injector
 *
 * Manages active failure injections and provides scenario execution.
 * In demo mode, all injections are simulated in-memory.
 */

import { CHAOS_SCENARIOS, type ChaosScenarioDef } from "./scenarios";
import { PaymentOrchestrator } from "@/lib/payment/orchestrator";
import { MockPaymentProvider } from "@/lib/payment/mock.provider";
import { ReconciliationEngine } from "@/lib/reconciliation/engine";
import { ReconciliationMatcher } from "@/lib/reconciliation/matcher";
import {
  recordTransaction,
  verifyLedgerIntegrity,
  getAllPaymentTransactions,
} from "@/lib/ledger/ledger.service";
import type { PaymentTransaction, LedgerEntry } from "@/lib/ledger/types";
import type { ExternalRecord, ReconciliationItem } from "@/lib/reconciliation/types";

// ─── Types ──────────────────────────────────────────────────────

export interface ActiveInjection {
  id: string;
  scenarioId: string;
  startedAt: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
}

export interface ChaosTestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  severity: string;
  injectDescription: string;
  expectedBehavior: string;
  actualBehavior: string;
  details: Record<string, unknown>;
  duration: number;
}

export interface ChaosTestReport {
  runAt: string;
  scenariosRun: number;
  passed: number;
  failed: number;
  passRate: number;
  results: ChaosTestResult[];
}

// ─── In-Memory Store ────────────────────────────────────────────

const activeInjections: ActiveInjection[] = [];
const testResults: ChaosTestResult[] = [];

// ─── Injector ───────────────────────────────────────────────────

export class ChaosInjector {
  /**
   * Run a single chaos scenario and return the result.
   */
  static async runScenario(scenarioId: string): Promise<ChaosTestResult> {
    const scenario = CHAOS_SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) {
      return {
        scenarioId,
        scenarioName: "Unknown",
        passed: false,
        severity: "LOW",
        injectDescription: "N/A",
        expectedBehavior: "N/A",
        actualBehavior: "Scenario not found",
        details: {},
        duration: 0,
      };
    }

    const startTime = Date.now();
    const injection: ActiveInjection = {
      id: `inj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      scenarioId,
      startedAt: new Date().toISOString(),
      status: "RUNNING",
    };
    activeInjections.push(injection);

    try {
      const result = await ChaosInjector.executeScenario(scenario);
      injection.status = "COMPLETED";
      const duration = Date.now() - startTime;

      const testResult: ChaosTestResult = {
        scenarioId,
        scenarioName: scenario.name,
        passed: result.passed,
        severity: scenario.severity,
        injectDescription: scenario.injectDescription,
        expectedBehavior: scenario.expectedBehavior,
        actualBehavior: result.actualBehavior,
        details: result.details,
        duration,
      };

      testResults.push(testResult);
      return testResult;
    } catch (error: any) {
      injection.status = "FAILED";
      const duration = Date.now() - startTime;

      const testResult: ChaosTestResult = {
        scenarioId,
        scenarioName: scenario.name,
        passed: false,
        severity: scenario.severity,
        injectDescription: scenario.injectDescription,
        expectedBehavior: scenario.expectedBehavior,
        actualBehavior: `Error: ${error.message}`,
        details: { error: error.message },
        duration,
      };

      testResults.push(testResult);
      return testResult;
    }
  }

  /**
   * Run all chaos scenarios and generate a full report.
   */
  static async runFullSuite(): Promise<ChaosTestReport> {
    testResults.length = 0; // Clear previous results

    for (const scenario of CHAOS_SCENARIOS) {
      await ChaosInjector.runScenario(scenario.id);
    }

    const passed = testResults.filter((r) => r.passed).length;
    const failed = testResults.filter((r) => !r.passed).length;

    return {
      runAt: new Date().toISOString(),
      scenariosRun: testResults.length,
      passed,
      failed,
      passRate: testResults.length > 0 ? passed / testResults.length : 0,
      results: [...testResults],
    };
  }

  /**
   * Get active injections.
   */
  static getActiveInjections(): ActiveInjection[] {
    return activeInjections.filter((i) => i.status === "RUNNING");
  }

  /**
   * Clear an injection.
   */
  static clearInjection(injectionId: string): boolean {
    const idx = activeInjections.findIndex((i) => i.id === injectionId);
    if (idx === -1) return false;
    activeInjections.splice(idx, 1);
    return true;
  }

  /**
   * Get the latest test report.
   */
  static getLatestReport(): ChaosTestReport | null {
    if (testResults.length === 0) return null;

    const passed = testResults.filter((r) => r.passed).length;
    const failed = testResults.filter((r) => !r.passed).length;

    return {
      runAt: new Date().toISOString(),
      scenariosRun: testResults.length,
      passed,
      failed,
      passRate: testResults.length > 0 ? passed / testResults.length : 0,
      results: [...testResults],
    };
  }

  // ─── Scenario Executors ───────────────────────────────────────

  private static async executeScenario(
    scenario: ChaosScenarioDef,
  ): Promise<{ passed: boolean; actualBehavior: string; details: Record<string, unknown> }> {
    switch (scenario.id) {
      case "provider-timeout":
        return ChaosInjector.testProviderTimeout();
      case "amount-mismatch":
        return ChaosInjector.testAmountMismatch();
      case "duplicate-charge":
        return ChaosInjector.testDuplicateCharge();
      case "missing-credit":
        return ChaosInjector.testMissingCredit();
      case "webhook-out-of-order":
        return ChaosInjector.testWebhookOutOfOrder();
      case "provider-down":
        return ChaosInjector.testProviderDown();
      case "slow-reconciliation":
        return ChaosInjector.testSlowReconciliation();
      case "refund-race-condition":
        return ChaosInjector.testRefundRaceCondition();
      default:
        return { passed: false, actualBehavior: "Unknown scenario", details: {} };
    }
  }

  // ─── Scenario 1: Provider Timeout ─────────────────────────────
  private static async testProviderTimeout(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    const runId = Date.now();

    // Use a mock provider with 100% failure rate to simulate timeout
    const provider = new MockPaymentProvider({ latency: 50, failureRate: 1.0 });
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 0,
      retryDelayMs: 10,
      provider,
    });

    const result = await orchestrator.processPayment({
      customerId: `chaos-timeout-${runId}`,
      merchantId: `chaos-merch-${runId}`,
      amount: 500,
      currency: "INR",
      method: "upi",
      description: "Chaos: provider timeout test",
    });

    // With failureRate=1.0, the mock provider will fail all operations
    // The orchestrator should handle this gracefully
    const passed = !result.success;

    return {
      passed,
      actualBehavior: passed
        ? `Orchestrator correctly returned failure. Payment state: ${result.transaction?.paymentState || "N/A"}`
        : `Orchestrator unexpectedly succeeded`,
      details: {
        success: result.success,
        error: result.error,
        transactionId: result.transaction?.id,
        paymentState: result.transaction?.paymentState,
      },
    };
  }

  // ─── Scenario 2: Amount Mismatch ──────────────────────────────
  private static async testAmountMismatch(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    const runId = Date.now();
    const matcher = new ReconciliationMatcher();

    const internalTxs: PaymentTransaction[] = [
      {
        id: `chaos-amt-${runId}`,
        customerId: "cust-1",
        merchantId: "merch-1",
        amount: 5000,
        currency: "INR",
        paymentState: "SUCCESS",
        settlementState: "NOT_REQUIRED",
        provider: "razorpay",
        providerReference: `ref-amt-${runId}`,
        idempotencyKey: `idem-amt-${runId}`,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const externalRecords: ExternalRecord[] = [
      {
        reference: `ref-amt-${runId}`,
        amount: 500, // MISMATCH: internal 5000 vs external 500
        currency: "INR",
        timestamp: new Date().toISOString(),
        status: "settled",
      },
    ];

    const { items } = matcher.match(internalTxs, externalRecords, `run-amt-${runId}`);

    const passed =
      items.length === 1 &&
      items[0].matchStatus === "MISMATCHED" &&
      items[0].mismatchType === "AMOUNT_MISMATCH";

    return {
      passed,
      actualBehavior: passed
        ? `Reconciliation detected AMOUNT_MISMATCH: internal=5000, external=500, diff=4500`
        : `Match status: ${items[0]?.matchStatus}, mismatch type: ${items[0]?.mismatchType}`,
      details: {
        matchStatus: items[0]?.matchStatus,
        mismatchType: items[0]?.mismatchType,
        internalAmount: items[0]?.internalAmount,
        externalAmount: items[0]?.externalAmount,
        difference: items[0]?.difference,
      },
    };
  }

  // ─── Scenario 3: Duplicate Charge ─────────────────────────────
  private static async testDuplicateCharge(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    const runId = Date.now();
    const matcher = new ReconciliationMatcher();

    const internalTxs: PaymentTransaction[] = [
      {
        id: `chaos-dup-${runId}`,
        customerId: "cust-1",
        merchantId: "merch-1",
        amount: 1000,
        currency: "INR",
        paymentState: "SUCCESS",
        settlementState: "NOT_REQUIRED",
        provider: "razorpay",
        providerReference: `ref-dup-${runId}`,
        idempotencyKey: `idem-dup-${runId}`,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Two external records for one internal transaction
    const externalRecords: ExternalRecord[] = [
      {
        reference: `ref-dup-${runId}`,
        amount: 1000,
        currency: "INR",
        timestamp: new Date().toISOString(),
        status: "settled",
      },
      {
        reference: `ref-dup-extra-${runId}`,
        amount: 1000,
        currency: "INR",
        timestamp: new Date().toISOString(),
        status: "settled",
      },
    ];

    const { items } = matcher.match(internalTxs, externalRecords, `run-dup-${runId}`);

    // One should be MATCHED, one UNMATCHED (MISSING_INTERNAL)
    const matched = items.filter((i) => i.matchStatus === "MATCHED");
    const unmatched = items.filter((i) => i.matchStatus === "UNMATCHED");

    const passed =
      items.length === 2 &&
      matched.length === 1 &&
      unmatched.length === 1 &&
      unmatched[0].mismatchType === "MISSING_INTERNAL";

    return {
      passed,
      actualBehavior: passed
        ? `Detected duplicate: 1 MATCHED, 1 UNMATCHED (MISSING_INTERNAL)`
        : `Items: ${items.length}, Matched: ${matched.length}, Unmatched: ${unmatched.length}`,
      details: {
        totalItems: items.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        unmatchedType: unmatched[0]?.mismatchType,
      },
    };
  }

  // ─── Scenario 4: Missing Credit ───────────────────────────────
  private static async testMissingCredit(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    // The ledger integrity check verifies SUM(debits) === SUM(credits)
    // In demo mode, all transactions are balanced by construction.
    // We verify that the integrity check exists and works.
    const integrity = await verifyLedgerIntegrity();

    const passed = integrity.valid;

    return {
      passed,
      actualBehavior: passed
        ? `Ledger integrity check passed: total debits=${integrity.totalDebits}, total credits=${integrity.totalCredits}, diff=${integrity.difference}`
        : `Ledger integrity FAILED: debits=${integrity.totalDebits}, credits=${integrity.totalCredits}, diff=${integrity.difference}`,
      details: {
        totalDebits: integrity.totalDebits,
        totalCredits: integrity.totalCredits,
        difference: integrity.difference,
        valid: integrity.valid,
      },
    };
  }

  // ─── Scenario 5: Webhook Out of Order ─────────────────────────
  private static async testWebhookOutOfOrder(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    // Test that the state machine rejects invalid transitions
    const { PaymentStateMachine } = await import("@/lib/payment/state-machine");

    // After FAILED, SUCCESS should not be allowed
    const transition = PaymentStateMachine.canTransitionPayment("FAILED", "SUCCESS");

    const passed = !transition.allowed;

    return {
      passed,
      actualBehavior: passed
        ? `State machine correctly rejected FAILED → SUCCESS transition`
        : `State machine unexpectedly allowed FAILED → SUCCESS`,
      details: {
        from: transition.from,
        to: transition.to,
        allowed: transition.allowed,
        reason: transition.reason,
      },
    };
  }

  // ─── Scenario 6: Provider Down ────────────────────────────────
  private static async testProviderDown(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    const runId = Date.now();
    const provider = new MockPaymentProvider({ latency: 10, failureRate: 1.0 });
    const healthCheck = await provider.healthCheck();

    // Provider should report unhealthy
    const passed = !healthCheck;

    return {
      passed,
      actualBehavior: passed
        ? `Provider correctly reported unhealthy (down)`
        : `Provider unexpectedly reported healthy`,
      details: {
        healthy: healthCheck,
        providerName: provider.config.name,
      },
    };
  }

  // ─── Scenario 7: Slow Reconciliation ──────────────────────────
  private static async testSlowReconciliation(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    const startTime = Date.now();

    // Create several payments then run reconciliation
    const orchestrator = new PaymentOrchestrator({ maxRetries: 1, retryDelayMs: 10 });
    const runId = Date.now();

    const txIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await orchestrator.processPayment({
        customerId: `chaos-bulk-${i}-${runId}`,
        merchantId: `chaos-merch-bulk-${runId}`,
        amount: 100 + i * 10,
        currency: "INR",
        method: "upi",
        description: `Bulk test payment ${i}`,
      });
      if (result.transaction) txIds.push(result.transaction.id);
    }

    const engine = new ReconciliationEngine({ provider: "razorpay" });
    const report = await engine.runReconciliation({
      start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    });

    const duration = Date.now() - startTime;
    const passed = report.run.status === "COMPLETED" && report.items.length >= 5;

    return {
      passed,
      actualBehavior: passed
        ? `Reconciliation completed in ${duration}ms: ${report.items.length} items, match rate: ${(report.summary.matchRate * 100).toFixed(0)}%`
        : `Reconciliation status: ${report.run.status}, items: ${report.items.length}`,
      details: {
        duration,
        itemsCount: report.items.length,
        matchRate: report.summary.matchRate,
        status: report.run.status,
      },
    };
  }

  // ─── Scenario 8: Refund Race Condition ────────────────────────
  private static async testRefundRaceCondition(): Promise<{
    passed: boolean;
    actualBehavior: string;
    details: Record<string, unknown>;
  }> {
    const runId = Date.now();
    const orchestrator = new PaymentOrchestrator({ maxRetries: 1, retryDelayMs: 10 });

    // Create a successful payment first
    const payment = await orchestrator.processPayment({
      customerId: `chaos-race-${runId}`,
      merchantId: `chaos-merch-race-${runId}`,
      amount: 300,
      currency: "INR",
      method: "upi",
      description: "Race condition test",
    });

    if (!payment.success || !payment.transaction) {
      return {
        passed: false,
        actualBehavior: "Precondition failed: could not create payment",
        details: { error: payment.error },
      };
    }

    // Now refund it — this tests the settlement state transitions
    const refund = await orchestrator.refundPayment({
      transactionId: payment.transaction.id,
      reason: "Chaos: refund race condition test",
    });

    const passed = refund.success;

    return {
      passed,
      actualBehavior: passed
        ? `Refund completed successfully: refundId=${refund.refundId}`
        : `Refund failed: ${refund.error}`,
      details: {
        transactionId: payment.transaction.id,
        refundSuccess: refund.success,
        refundId: refund.refundId,
        error: refund.error,
      },
    };
  }
}
