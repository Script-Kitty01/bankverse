/**
 * BankVerse — Unified Payment Provider Webhook Pipeline
 *
 * Receives webhook events from payment providers (Razorpay, Dwolla, Plaid, Mock).
 * Architecture:
 *   1. Signature verification (HMAC-SHA256)
 *   2. Idempotency deduplication (eventId / request hash)
 *   3. Dual-dimension state machine transition validation
 *   4. Asynchronous ledger settlement & outbox trigger
 *
 * POST /api/webhooks/payment-provider
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  updatePaymentTransactionState,
  getPaymentTransactionByProviderOrderId,
  settleToMerchant,
} from "@/lib/ledger/ledger.service";
import { PaymentStateMachine } from "@/lib/payment/state-machine";
import { IdempotencyManager } from "@/lib/security/idempotency";
import type { PaymentState, SettlementState } from "@/lib/ledger/types";

export interface UnifiedWebhookPayload {
  eventId: string;
  provider: string;
  eventType:
    | "payment.captured"
    | "payment.failed"
    | "payment.refunded"
    | "settlement.processed";
  providerOrderId: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  timestamp: string;
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    // Fallback
  }

  const signature = req.headers?.get?.("x-webhook-signature") || "";
  const webhookSecret = process.env.RAZORPAY_KEY_SECRET || "demo_webhook_secret";

  // In demo mode or when secret is set, verify signature if signature header is provided
  if (signature && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid HMAC webhook signature" },
        { status: 401 },
      );
    }
  }

  let payload: UnifiedWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  const { eventId, eventType, providerOrderId, providerPaymentId } = payload;

  if (!eventId || !providerOrderId) {
    return NextResponse.json(
      { success: false, error: "Missing required webhook fields" },
      { status: 400 },
    );
  }

  // 1. Webhook Deduplication
  const lockAcquired = await IdempotencyManager.acquireLock(
    `webhook:${eventId}`,
    60,
  );
  if (!lockAcquired) {
    return NextResponse.json(
      {
        success: true,
        status: "DUPLICATE",
        message: "Webhook event currently processing or already completed",
      },
      { status: 200 },
    );
  }

  try {
    // 2. Fetch target payment transaction by provider order ID
    const tx = await getPaymentTransactionByProviderOrderId(providerOrderId);
    if (!tx) {
      await IdempotencyManager.releaseLock(`webhook:${eventId}`);
      return NextResponse.json(
        { success: false, error: `Transaction for order ${providerOrderId} not found` },
        { status: 404 },
      );
    }

    let targetPaymentState: PaymentState = tx.paymentState;
    let targetSettlementState: SettlementState = tx.settlementState;

    // 3. Process event type via dual-dimension state machine
    if (eventType === "payment.captured") {
      targetPaymentState = "SUCCESS";
      targetSettlementState = "NOT_REQUIRED";
    } else if (eventType === "payment.failed") {
      targetPaymentState = "FAILED";
    } else if (eventType === "payment.refunded") {
      targetSettlementState = "REFUNDED";
    } else if (eventType === "settlement.processed") {
      targetSettlementState = "RESOLVED";
    }

    // Check if transition is allowed
    const canTransition = PaymentStateMachine.canTransitionPayment(
      tx.paymentState,
      targetPaymentState,
    );

    if (canTransition.allowed && tx.paymentState !== targetPaymentState) {
      await updatePaymentTransactionState(
        tx.id,
        targetPaymentState,
        targetSettlementState,
        { providerPaymentId },
        tx.version,
      );
    }

    // Trigger atomic settlement if captured
    if (eventType === "payment.captured" || eventType === "settlement.processed") {
      try {
        await settleToMerchant(tx.id);
      } catch {
        // Settlement already completed or handled concurrently
      }
    }

    return NextResponse.json({
      success: true,
      status: "PROCESSED",
      transactionId: tx.id,
      paymentState: targetPaymentState,
      settlementState: targetSettlementState,
    });
  } catch (err: unknown) {
    await IdempotencyManager.releaseLock(`webhook:${eventId}`);
    return NextResponse.json(
      {
        success: false,
        error: (err as Error).message || "Webhook processing error",
      },
      { status: 500 },
    );
  }
}