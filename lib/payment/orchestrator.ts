/**
 * BankVerse — Payment Orchestrator
 *
 * Coordinates the full payment lifecycle:
 * 1. Create order via provider
 * 2. Record double-entry ledger transaction
 * 3. Verify payment
 * 4. Capture payment
 * 5. Update state machine
 * 6. Handle retries, refunds, and idempotency
 */

import type { PaymentProvider } from "./provider.interface";
import { MockPaymentProvider } from "./mock.provider";
import { RazorpayPaymentProvider } from "./razorpay.provider";
import { PaymentStateMachine } from "./state-machine";
import {
  recordTransaction,
  updatePaymentTransactionState,
  getPaymentTransactionById,
  getPaymentTransactionByIdempotencyKey,
  reverseTransaction,
} from "@/lib/ledger/ledger.service";
import type {
  PaymentTransaction,
  PaymentState,
  SettlementState,
} from "@/lib/ledger/types";

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

  constructor(config?: Partial<OrchestratorConfig> & { provider?: PaymentProvider }) {
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

  async processPayment(request: PaymentRequest): Promise<PaymentResult> {
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

    // Step 2: Record double-entry ledger transaction
    const ledgerResult = await recordTransaction({
      customerId: request.customerId,
      merchantId: request.merchantId,
      amount: request.amount,
      currency: request.currency,
      provider: this.provider.config.name,
      providerReference: orderResult.orderId,
      idempotencyKey,
      description: request.description || `Payment via ${request.method}`,
    });

    // Step 3: Transition to PROCESSING
    await updatePaymentTransactionState(
      ledgerResult.transaction.id,
      PaymentStateMachine.transitionPayment("CREATED", "PROCESSING"),
      "NOT_REQUIRED",
    );

    // Step 4: Verify & capture with retries
    const captureResult = await this.captureWithRetries(
      ledgerResult.transaction,
      orderResult.orderId,
    );

    if (!captureResult.success) {
      // Transition to FAILED
      await updatePaymentTransactionState(
        ledgerResult.transaction.id,
        PaymentStateMachine.transitionPayment("PROCESSING", "FAILED"),
        "PENDING_RECONCILIATION",
      );
      return {
        success: false,
        transaction: ledgerResult.transaction,
        orderId: orderResult.orderId,
        error: captureResult.error,
        retryCount: captureResult.retryCount,
      };
    }

    // Step 5: Transition to SUCCESS
    await updatePaymentTransactionState(
      ledgerResult.transaction.id,
      PaymentStateMachine.transitionPayment("PROCESSING", "SUCCESS"),
      "NOT_REQUIRED",
    );

    return {
      success: true,
      transaction: ledgerResult.transaction,
      orderId: orderResult.orderId,
      paymentId: captureResult.paymentId,
    };
  }

  // ─── Capture with Retries ─────────────────────────────────────

  private async captureWithRetries(
    transaction: PaymentTransaction,
    orderId: string,
  ): Promise<{
    success: boolean;
    paymentId?: string;
    error?: string;
    retryCount?: number;
  }> {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // In demo mode, simulate payment verification
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
          return { success: false, error: lastError, retryCount: attempt };
        }

        const captureResult = await this.provider.capturePayment({
          paymentId: verifyResult.paymentId || mockPaymentId,
          amount: transaction.amount,
          currency: transaction.currency,
        });

        if (captureResult.success) {
          return {
            success: true,
            paymentId: captureResult.paymentId || mockPaymentId,
            retryCount: attempt,
          };
        }

        lastError = captureResult.error;
        if (attempt < this.config.maxRetries) {
          await this.delay(attempt);
        }
      } catch (error: any) {
        lastError = error.message || "Unknown capture error";
        if (attempt < this.config.maxRetries) {
          await this.delay(attempt);
        }
      }
    }

    return {
      success: false,
      error: lastError,
      retryCount: this.config.maxRetries,
    };
  }

  // ─── Refund ───────────────────────────────────────────────────

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

    // Transition settlement state: NOT_REQUIRED → PENDING_RECONCILIATION → REFUND_PENDING
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
      paymentId: transaction.providerReference,
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
    } catch (ledgerError: any) {
      // Provider refunded but ledger update failed — escalate for manual fix
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
        error: `Provider refund succeeded but ledger reversal failed: ${ledgerError.message}`,
      };
    }

    // Transition to REFUNDED
    await updatePaymentTransactionState(
      transaction.id,
      transaction.paymentState,
      PaymentStateMachine.transitionSettlement(currentSettlement, "REFUNDED"),
    );

    return { success: true, refundId: refundResult.refundId };
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
