/**
 * BankVerse — Payment Orchestrator
 *
 * Coordinates the full payment lifecycle:
 * 1. Create order via provider
 * 2. Record ledger ONLY after provider confirms capture (money movement is source of truth)
 * 3. Use clearing account: Customer→Clearing→Merchant (three-legged booking)
 * 4. Handle UNKNOWN state with getPaymentStatus() recovery
 * 5. Separate refundCapturedPayment() from compensateUnresolvedPayment()
 *
 * ARCHITECTURE:
 *   createOrder → PROCESSING → verify → capture → SUCCESS → recordTransaction → settleToMerchant
 *   If UNKNOWN/timeout: PROCESSING → UNKNOWN → queryProvider → SUCCESS→ledger OR FAILED→no ledger
 */

import type { PaymentProvider } from "./provider.interface";
import { MockPaymentProvider } from "./mock.provider";
import { RazorpayPaymentProvider } from "./razorpay.provider";
import { PaymentStateMachine } from "./state-machine";
import {
  recordTransaction,
  settleToMerchant,
  reverseFromClearing,
  reverseTransaction,
  updatePaymentTransactionState,
  getPaymentTransactionById,
  getPaymentTransactionByIdempotencyKey,
} from "@/lib/ledger/ledger.service";
import { IdempotencyManager } from "@/lib/security/idempotency";
import type { PaymentTransaction } from "@/lib/ledger/types";

// ─── Types ──────────────────────────────────────────────────────

export interface PaymentRequest {
  customerId: string;
  merchantId: string;
  amount: number;
  currency: string;
  method: "upi" | "card" | "netbanking" | "wallet";
  description?: string;
  idempotencyKey?: string;
}

export interface PaymentResult {
  success: boolean;
  transaction?: PaymentTransaction;
  orderId?: string;
  paymentId?: string;
  error?: string;
  retryCount?: number;
}

export interface RefundRequest {
  transactionId: string;
  amount?: number; // partial refund if provided
  reason: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;
  error?: string;
}

export interface OrchestratorConfig {
  maxRetries: number;
  retryDelayMs: number;
  retryBackoffMultiplier: number;
}

// ─── Default Config ─────────────────────────────────────────────

const DEFAULT_CONFIG: OrchestratorConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  retryBackoffMultiplier: 2,
};

// ─── Orchestrator ───────────────────────────────────────────────

export class PaymentOrchestrator {
  private provider: PaymentProvider;
  private config: OrchestratorConfig;

  constructor(
    config?: Partial<OrchestratorConfig> & { provider?: PaymentProvider },
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = config?.provider ?? this.resolveProvider();
  }

  private resolveProvider(): PaymentProvider {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      return new MockPaymentProvider();
    }
    return new RazorpayPaymentProvider();
  }

  /**
   * Get the active provider (useful for health checks).
   */
  getProvider(): PaymentProvider {
    return this.provider;
  }

  // ─── Process Payment (Full Flow) ──────────────────────────────
  //
  // NEW FLOW (ledger AFTER provider confirmation):
  //   1. createOrder → CREATED
  //   2. verify + capture → PROCESSING
  //   3. On SUCCESS: recordTransaction (Customer→Clearing) → settleToMerchant (Clearing→Merchant)
  //   4. On FAILED: no ledger entry (no money moved)
  //   5. On UNKNOWN: query provider → resolve to SUCCESS or FAILED

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
    // NOTE: No in-memory mutex. Idempotency is enforced by:
    //   1. Pre-check: look for existing transaction by idempotencyKey
    //   2. recordTransaction() has its own pre-check + post-create check
    //   3. In production, a DB UNIQUE constraint on idempotencyKey makes this atomic.
    //   The OCC version check on state transitions is the sole concurrency guard.

    const idempotencyKey =
      request.idempotencyKey ||
      `pay_${request.customerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Idempotency check
    const existing =
      await getPaymentTransactionByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        success: existing.paymentState === "SUCCESS",
        transaction: existing,
        orderId: existing.providerOrderId,
        paymentId: existing.providerPaymentId,
        error:
          existing.paymentState !== "SUCCESS"
            ? `Payment already exists in state: ${existing.paymentState}`
            : undefined,
      };
    }

    // Step 1: Create order via provider
    const orderResult = await this.provider.createOrder({
      amount: request.amount,
      currency: request.currency,
      receipt: `rcpt_${idempotencyKey}`,
      notes: {
        customerId: request.customerId,
        merchantId: request.merchantId,
        method: request.method,
      },
    });

    if (!orderResult.success || !orderResult.orderId) {
      return {
        success: false,
        error: orderResult.error || "Order creation failed",
      };
    }

    // Step 2: Verify & capture with retries (NO ledger yet — money hasn't moved)
    const captureResult = await this.captureWithRetries(
      orderResult.orderId,
      request,
    );

    if (captureResult.success) {
      // Step 3a: Provider confirmed capture → NOW record the ledger
      const ledgerResult = await recordTransaction({
        customerId: request.customerId,
        merchantId: request.merchantId,
        amount: request.amount,
        currency: request.currency,
        provider: this.provider.config.name,
        providerReference: orderResult.orderId,
        providerOrderId: orderResult.orderId,
        idempotencyKey,
        description: request.description || `Payment via ${request.method}`,
        method: request.method,
      });

      // Update with provider payment ID and version OCC guard
      const updatedTx = await updatePaymentTransactionState(
        ledgerResult.transaction.id,
        PaymentStateMachine.transitionPayment("PROCESSING", "SUCCESS"),
        "NOT_REQUIRED",
        { providerPaymentId: captureResult.paymentId },
        ledgerResult.transaction.version ?? 1,
      );

      // Step 3b: Settle from clearing to merchant
      await settleToMerchant(ledgerResult.transaction.id);

      const finalTx = updatedTx || ledgerResult.transaction;

      // Cache result in Tier 1 (Redis) & Tier 2 (DB) Idempotency Layer
      await IdempotencyManager.cacheResult(idempotencyKey, {
        transaction: finalTx,
        cachedAt: new Date().toISOString(),
      });

      return {
        success: true,
        transaction: finalTx,
        orderId: orderResult.orderId,
        paymentId: captureResult.paymentId,
      };
    }

    if (captureResult.unknown) {
      // Step 3b: UNKNOWN — query provider to resolve
      const statusResult = await this.provider.getPaymentStatus({
        orderId: orderResult.orderId,
      });

      if (statusResult.success && statusResult.status === "captured") {
        // Provider says captured — record ledger and settle
        const ledgerResult = await recordTransaction({
          customerId: request.customerId,
          merchantId: request.merchantId,
          amount: request.amount,
          currency: request.currency,
          provider: this.provider.config.name,
          providerReference: orderResult.orderId,
          providerOrderId: orderResult.orderId,
          idempotencyKey,
          description: request.description || `Payment via ${request.method}`,
          method: request.method,
        });

        const updatedTx = await updatePaymentTransactionState(
          ledgerResult.transaction.id,
          PaymentStateMachine.transitionPayment("PROCESSING", "SUCCESS"),
          "NOT_REQUIRED",
          { providerPaymentId: statusResult.paymentId },
          ledgerResult.transaction.version ?? 1,
        );

        await settleToMerchant(ledgerResult.transaction.id);

        return {
          success: true,
          transaction: updatedTx || ledgerResult.transaction,
          orderId: orderResult.orderId,
          paymentId: statusResult.paymentId,
        };
      }

      // Provider says not captured — no ledger, mark FAILED
      return {
        success: false,
        orderId: orderResult.orderId,
        error:
          captureResult.error || "Payment not captured (resolved to FAILED)",
        retryCount: captureResult.retryCount,
      };
    }

    // Step 3c: FAILED — no ledger entry (no money moved)
    return {
      success: false,
      orderId: orderResult.orderId,
      error: captureResult.error,
      retryCount: captureResult.retryCount,
    };
  }

  // ─── Capture with Retries ─────────────────────────────────────

  private async captureWithRetries(
    orderId: string,
    request: PaymentRequest,
  ): Promise<{
    success: boolean;
    unknown: boolean;
    paymentId?: string;
    error?: string;
    retryCount?: number;
  }> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const mockPaymentId = `pay_${this.provider.config.name}_${Date.now()}`;
        const mockSignature = "demo_signature";

        const verifyResult = await this.provider.verifyPayment({
          orderId,
          paymentId: mockPaymentId,
          signature: mockSignature,
        });

        if (!verifyResult.success) {
          lastError = verifyResult.error;
          if (attempt < this.config.maxRetries) {
            await this.delay(attempt);
            continue;
          }
          return {
            success: false,
            unknown: false,
            error: lastError,
            retryCount: attempt,
          };
        }

        const captureResult = await this.provider.capturePayment({
          paymentId: verifyResult.paymentId || mockPaymentId,
          amount: request.amount,
          currency: request.currency,
        });

        if (captureResult.success) {
          return {
            success: true,
            unknown: false,
            paymentId: captureResult.paymentId || mockPaymentId,
            retryCount: attempt,
          };
        }

        lastError = captureResult.error;
        if (attempt < this.config.maxRetries) {
          await this.delay(attempt);
        }
      } catch (error: unknown) {
        lastError = (error as Error).message || "Unknown capture error";
        if (attempt < this.config.maxRetries) {
          await this.delay(attempt);
        }
      }
    }

    // All retries exhausted — mark as UNKNOWN (may have succeeded at provider)
    return {
      success: false,
      unknown: true,
      error: lastError,
      retryCount: this.config.maxRetries,
    };
  }

  // ─── Refund Captured Payment ──────────────────────────────────

  async refundPayment(request: RefundRequest): Promise<RefundResult> {
    const transaction = await getPaymentTransactionById(request.transactionId);
    if (!transaction) {
      return { success: false, error: "Transaction not found" };
    }

    if (transaction.paymentState !== "SUCCESS") {
      return {
        success: false,
        error: `Cannot refund payment in state: ${transaction.paymentState}`,
      };
    }

    // Transition settlement state
    let currentSettlement = transaction.settlementState;
    if (currentSettlement === "NOT_REQUIRED") {
      currentSettlement = PaymentStateMachine.transitionSettlement(
        currentSettlement,
        "PENDING_RECONCILIATION",
      );
      await updatePaymentTransactionState(
        transaction.id,
        transaction.paymentState,
        currentSettlement,
      );
    }
    currentSettlement = PaymentStateMachine.transitionSettlement(
      currentSettlement,
      "REFUND_PENDING",
    );
    await updatePaymentTransactionState(
      transaction.id,
      transaction.paymentState,
      currentSettlement,
    );

    // Process refund via provider FIRST (money movement is source of truth)
    const refundResult = await this.provider.refundPayment({
      paymentId: transaction.providerPaymentId || transaction.providerReference,
      amount: request.amount,
      reason: request.reason,
    });

    if (!refundResult.success) {
      await updatePaymentTransactionState(
        transaction.id,
        transaction.paymentState,
        PaymentStateMachine.transitionSettlement(
          currentSettlement,
          "ESCALATED",
        ),
      );
      return { success: false, error: refundResult.error };
    }

    // Reverse the ledger (idempotent — safe to retry if this fails)
    try {
      await reverseTransaction(transaction.id, request.reason);
    } catch (ledgerError: unknown) {
      await updatePaymentTransactionState(
        transaction.id,
        transaction.paymentState,
        PaymentStateMachine.transitionSettlement(
          currentSettlement,
          "ESCALATED",
        ),
      );
      return {
        success: false,
        error: `Provider refund succeeded but ledger reversal failed: ${(ledgerError as Error).message}`,
      };
    }

    // Transition to REFUNDED
    await updatePaymentTransactionState(
      transaction.id,
      transaction.paymentState,
      PaymentStateMachine.transitionSettlement(currentSettlement, "REFUNDED"),
      { providerRefundId: refundResult.refundId },
    );

    return { success: true, refundId: refundResult.refundId };
  }

  // ─── Compensate Unresolved Payment ────────────────────────────
  //
  // For payments stuck in UNKNOWN or FAILED where money may have moved.
  // Different from refundPayment() which handles confirmed SUCCESS payments.

  async compensateUnresolvedPayment(
    transactionId: string,
    reason: string,
  ): Promise<RefundResult> {
    const transaction = await getPaymentTransactionById(transactionId);
    if (!transaction) {
      return { success: false, error: "Transaction not found" };
    }

    // Only compensate UNKNOWN or FAILED payments
    if (
      transaction.paymentState !== "UNKNOWN" &&
      transaction.paymentState !== "FAILED"
    ) {
      return {
        success: false,
        error: `Cannot compensate payment in state: ${transaction.paymentState}. Use refundPayment() for SUCCESS payments.`,
      };
    }

    // Check if money was already booked to clearing
    const { getLedgerEntriesByTransaction } =
      await import("@/lib/ledger/ledger.service");
    const entries = await getLedgerEntriesByTransaction(transactionId);

    if (entries.length === 0) {
      // No ledger entries — money never moved, nothing to compensate
      await updatePaymentTransactionState(
        transactionId,
        transaction.paymentState,
        PaymentStateMachine.transitionSettlement(
          transaction.settlementState,
          "RESOLVED",
        ),
      );
      return {
        success: true,
        refundId: `compensate_nop_${transactionId}`,
      };
    }

    // Money is in clearing — reverse it back to customer
    try {
      await reverseFromClearing(transactionId, reason);
    } catch (ledgerError: unknown) {
      await updatePaymentTransactionState(
        transactionId,
        transaction.paymentState,
        PaymentStateMachine.transitionSettlement(
          transaction.settlementState,
          "ESCALATED",
        ),
      );
      return {
        success: false,
        error: `Compensation ledger reversal failed: ${(ledgerError as Error).message}`,
      };
    }

    await updatePaymentTransactionState(
      transactionId,
      transaction.paymentState,
      PaymentStateMachine.transitionSettlement(
        transaction.settlementState,
        "COMPENSATED",
      ),
    );

    return {
      success: true,
      refundId: `compensate_${transactionId}`,
    };
  }

  // ─── Health Check ─────────────────────────────────────────────

  async healthCheck(): Promise<{ provider: string; healthy: boolean }> {
    const healthy = await this.provider.healthCheck();
    return { provider: this.provider.config.name, healthy };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  private async delay(attempt: number): Promise<void> {
    const ms =
      this.config.retryDelayMs *
      Math.pow(this.config.retryBackoffMultiplier, attempt);
    await new Promise((r) => setTimeout(r, ms));
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let orchestratorInstance: PaymentOrchestrator | null = null;

export function getPaymentOrchestrator(
  config?: Partial<OrchestratorConfig>,
): PaymentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new PaymentOrchestrator(config);
  } else if (config) {
    console.warn(
      "[PaymentOrchestrator] Config provided but singleton already exists. " +
        "Config is ignored. Call resetPaymentOrchestrator() first if you need to change config.",
    );
  }
  return orchestratorInstance;
}

/** Reset singleton (useful for testing with different configs). */
export function resetPaymentOrchestrator(): void {
  orchestratorInstance = null;
}
