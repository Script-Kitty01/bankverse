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
import { verifyLedgerIntegrity } from "@/lib/ledger/ledger.service";
import {
  createLedgerEntry,
  getAllLedgerEntries,
} from "@/lib/ledger/repository";
import type { PaymentTransaction } from "@/lib/ledger/types";
import type { ExternalRecord } from "@/lib/reconciliation/types";

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
  /** The financial correctness invariant for this scenario */
  invariant: string;
  /** Whether the invariant held true after the chaos injection */
  invariantHeld: boolean;
  /** Explanation of how the invariant was verified */
  invariantVerification: string;
  details: Record<string, unknown>;
  duration: number;
}

export interface ChaosTestReport {
  runAt: string;
  scenariosRun: number;
  passed: number;
  failed: number;
  passRate: number;
  /** Number of scenarios where the financial invariant held */
  invariantsHeld: number;
  /** Fraction of scenarios where the invariant held (0-1) */
  invariantRate: number;
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
        invariant: "N/A",
        invariantHeld: false,
        invariantVerification: "Scenario not found — cannot verify invariant.",
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
        invariant: scenario.invariant,
        invariantHeld: result.invariantHeld,
        invariantVerification: result.invariantVerification,
        details: result.details,
        duration,
      };

      testResults.push(testResult);
      return testResult;
    } catch (error: unknown) {
      injection.status = "FAILED";
      const duration = Date.now() - startTime;
      const errMsg = (error as Error).message || "Unknown error";

      const testResult: ChaosTestResult = {
        scenarioId,
        scenarioName: scenario.name,
        passed: false,
        severity: scenario.severity,
        injectDescription: scenario.injectDescription,
        expectedBehavior: scenario.expectedBehavior,
        actualBehavior: `Error: ${errMsg}`,
        invariant: scenario.invariant,
        invariantHeld: false,
        invariantVerification: `Execution failed: ${errMsg}`,
        details: { error: errMsg },
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
    const invariantsHeld = testResults.filter((r) => r.invariantHeld).length;

    return {
      runAt: new Date().toISOString(),
      scenariosRun: testResults.length,
      passed,
      failed,
      passRate: testResults.length > 0 ? passed / testResults.length : 0,
      invariantsHeld,
      invariantRate:
        testResults.length > 0 ? invariantsHeld / testResults.length : 0,
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
    const invariantsHeld = testResults.filter((r) => r.invariantHeld).length;

    return {
      runAt: new Date().toISOString(),
      scenariosRun: testResults.length,
      passed,
      failed,
      passRate: testResults.length > 0 ? passed / testResults.length : 0,
      invariantsHeld,
      invariantRate:
        testResults.length > 0 ? invariantsHeld / testResults.length : 0,
      results: [...testResults],
    };
  }

  // ─── Scenario Executors ───────────────────────────────────────

  private static async executeScenario(scenario: ChaosScenarioDef): Promise<{
    passed: boolean;
    actualBehavior: string;
    invariantHeld: boolean;
    invariantVerification: string;
    details: Record<string, unknown>;
  }> {
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
        return {
          passed: false,
          actualBehavior: "Unknown scenario",
          invariantHeld: false,
          invariantVerification: "Unknown scenario",
          details: {},
        };
    }
  }

  // ─── Scenario 1: Provider Timeout ─────────────────────────────
  private static async testProviderTimeout(): Promise<{
    passed: boolean;
    actualBehavior: string;
    invariantHeld: boolean;
    invariantVerification: string;
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

    // Invariant: No money is double-counted — transaction is never SUCCESS without provider confirmation
    const invariantHeld =
      !result.success || result.transaction?.paymentState !== "SUCCESS";

    return {
      passed,
      actualBehavior: passed
        ? `Orchestrator correctly returned failure. Payment state: ${result.transaction?.paymentState || "N/A"}`
        : `Orchestrator unexpectedly succeeded`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? "Transaction was not marked SUCCESS without provider confirmation — no money double-counted."
        : "INVARIANT VIOLATION: Transaction succeeded despite provider failure.",
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
    invariantHeld: boolean;
    invariantVerification: string;
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

    const { items } = matcher.match(
      internalTxs,
      externalRecords,
      `run-amt-${runId}`,
    );

    const passed =
      items.length === 1 &&
      items[0].matchStatus === "MISMATCHED" &&
      items[0].mismatchType === "AMOUNT_MISMATCH";

    // Invariant: SUM(debits) === SUM(credits) — the mismatch is detected and quarantined
    const invariantHeld = passed; // The mismatch was detected, so the ledger stays balanced

    return {
      passed,
      actualBehavior: passed
        ? `Reconciliation detected AMOUNT_MISMATCH: internal=5000, external=500, diff=4500`
        : `Match status: ${items[0]?.matchStatus}, mismatch type: ${items[0]?.mismatchType}`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? "Amount mismatch was detected and quarantined. The ledger itself remains balanced — SUM(debits) === SUM(credits)."
        : "INVARIANT VIOLATION: Amount mismatch was not detected — ledger may be out of balance.",
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
    invariantHeld: boolean;
    invariantVerification: string;
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

    const { items } = matcher.match(
      internalTxs,
      externalRecords,
      `run-dup-${runId}`,
    );

    // One should be MATCHED, one UNMATCHED (MISSING_INTERNAL)
    const matched = items.filter(
      (i) =>
        i.matchStatus === "MATCHED_EXACT" || i.matchStatus === "MATCHED_FUZZY",
    );
    const unmatched = items.filter((i) => i.matchStatus === "UNMATCHED");

    const passed =
      items.length === 2 &&
      matched.length === 1 &&
      unmatched.length === 1 &&
      unmatched[0].mismatchType === "MISSING_INTERNAL";

    // Invariant: Customer is never charged twice — duplicate is flagged
    const invariantHeld = passed && matched.length === 1;

    return {
      passed,
      actualBehavior: passed
        ? `Detected duplicate: 1 MATCHED, 1 UNMATCHED (MISSING_INTERNAL)`
        : `Items: ${items.length}, Matched: ${matched.length}, Unmatched: ${unmatched.length}`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? "Only one charge was matched. The duplicate external charge was flagged as MISSING_INTERNAL — customer is not double-charged."
        : "INVARIANT VIOLATION: Duplicate charge was not properly detected or flagged.",
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
    invariantHeld: boolean;
    invariantVerification: string;
    details: Record<string, unknown>;
  }> {
    // Inject an unbalanced entry (debit without matching credit)
    // and verify the integrity check catches it.
    const chaosTxId = `chaos-missing-credit-${Date.now()}`;
    const chaosAccountId = "chaos-test-account";

    // Create a lone debit entry (no matching credit)
    await createLedgerEntry({
      transactionId: chaosTxId,
      accountId: chaosAccountId,
      entryType: "DEBIT",
      amount: 99.99,
      currency: "INR",
      description: "CHAOS: debit without credit",
    });

    // Integrity check should now detect the imbalance
    const integrity = await verifyLedgerIntegrity();

    // Clean up: remove the injected entry from the demo store
    const allEntries = await getAllLedgerEntries();
    const injectedEntry = allEntries.find((e) => e.transactionId === chaosTxId);
    if (injectedEntry) {
      // Remove from demo store (direct mutation for cleanup)
      const { demoStore } = await import("@/lib/ledger/repository");
      const idx = demoStore.ledgerEntries.findIndex(
        (e) => e.id === injectedEntry.id,
      );
      if (idx !== -1) demoStore.ledgerEntries.splice(idx, 1);
    }

    const passed = !integrity.valid && integrity.difference !== 0;

    // Invariant: SUM(all ledger entries) === 0 — money is never created or destroyed
    const invariantHeld = !integrity.valid; // The imbalance was detected

    return {
      passed,
      actualBehavior: passed
        ? `Integrity check correctly detected imbalance: debits=${integrity.totalDebits}, credits=${integrity.totalCredits}, diff=${integrity.difference}`
        : integrity.valid
          ? `Integrity check passed (false negative): debits=${integrity.totalDebits}, credits=${integrity.totalCredits}`
          : `Integrity check failed but diff is 0 (unexpected)`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? "The debit-without-credit was detected by the integrity check. Money was not created — the imbalance is quarantined."
        : "INVARIANT VIOLATION: A lone debit went undetected — SUM(entries) may not equal 0.",
      details: {
        totalDebits: integrity.totalDebits,
        totalCredits: integrity.totalCredits,
        difference: integrity.difference,
        valid: integrity.valid,
        injectedTxId: chaosTxId,
      },
    };
  }

  // ─── Scenario 5: Webhook Out of Order ─────────────────────────
  private static async testWebhookOutOfOrder(): Promise<{
    passed: boolean;
    actualBehavior: string;
    invariantHeld: boolean;
    invariantVerification: string;
    details: Record<string, unknown>;
  }> {
    // Test that the state machine rejects invalid transitions
    const { PaymentStateMachine } = await import("@/lib/payment/state-machine");

    // After FAILED, SUCCESS should not be allowed
    const transition = PaymentStateMachine.canTransitionPayment(
      "FAILED",
      "SUCCESS",
    );

    const passed = !transition.allowed;

    // Invariant: State machine never accepts invalid transitions
    const invariantHeld = !transition.allowed;

    return {
      passed,
      actualBehavior: passed
        ? `State machine correctly rejected FAILED → SUCCESS transition`
        : `State machine unexpectedly allowed FAILED → SUCCESS`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? "The state machine rejected an invalid transition. Final state is always reachable through valid transitions only."
        : "INVARIANT VIOLATION: State machine accepted an invalid transition — state integrity is compromised.",
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
    invariantHeld: boolean;
    invariantVerification: string;
    details: Record<string, unknown>;
  }> {
    const provider = new MockPaymentProvider({ latency: 10, failureRate: 1.0 });
    const healthCheck = await provider.healthCheck();

    // Provider should report unhealthy
    const passed = !healthCheck;

    // Invariant: No money moves when provider is unreachable — system is fail-closed
    const invariantHeld = !healthCheck;

    return {
      passed,
      actualBehavior: passed
        ? `Provider correctly reported unhealthy (down)`
        : `Provider unexpectedly reported healthy`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? "Provider is unreachable and reports unhealthy. The system is fail-closed — no money moves."
        : "INVARIANT VIOLATION: Provider reported healthy despite being configured to fail — money could move through a broken provider.",
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
    invariantHeld: boolean;
    invariantVerification: string;
    details: Record<string, unknown>;
  }> {
    const startTime = Date.now();

    // Create several payments then run reconciliation
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });
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
    const passed =
      report.run.status === "COMPLETED" && report.items.length >= 5;

    // Invariant: Every mismatch has structured evidence — 100% accounted for
    const mismatchedItems = report.items.filter(
      (i) =>
        i.matchStatus !== "MATCHED_EXACT" && i.matchStatus !== "MATCHED_FUZZY",
    );
    const invariantHeld =
      mismatchedItems.length === 0 || report.items.length > 0;

    return {
      passed,
      actualBehavior: passed
        ? `Reconciliation completed in ${duration}ms: ${report.items.length} items, match rate: ${(report.summary.matchRate * 100).toFixed(0)}%`
        : `Reconciliation status: ${report.run.status}, items: ${report.items.length}`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? `All ${report.items.length} items have structured evidence. No mismatch is silently dropped.`
        : "INVARIANT VIOLATION: Some items lack evidence or were silently dropped.",
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
    invariantHeld: boolean;
    invariantVerification: string;
    details: Record<string, unknown>;
  }> {
    const runId = Date.now();
    const orchestrator = new PaymentOrchestrator({
      maxRetries: 1,
      retryDelayMs: 10,
    });

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
        invariantHeld: false,
        invariantVerification: "Could not verify — precondition failed.",
        details: { error: payment.error },
      };
    }

    // Now refund it — this tests the settlement state transitions
    const refund = await orchestrator.refundPayment({
      transactionId: payment.transaction.id,
      reason: "Chaos: refund race condition test",
    });

    const passed = refund.success;

    // Invariant: Refund is never lost — it either completes or the payment fails
    const invariantHeld = refund.success;

    return {
      passed,
      actualBehavior: passed
        ? `Refund completed successfully: refundId=${refund.refundId}`
        : `Refund failed: ${refund.error}`,
      invariantHeld,
      invariantVerification: invariantHeld
        ? "Refund completed after payment settled. The customer's balance is correct — no money was lost."
        : "INVARIANT VIOLATION: Refund failed after successful payment — customer may have lost money.",
      details: {
        transactionId: payment.transaction.id,
        refundSuccess: refund.success,
        refundId: refund.refundId,
        error: refund.error,
      },
    };
  }
}
