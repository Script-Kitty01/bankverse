/**
 * BankVerse — Razorpay Webhook Handler
 *
 * Receives payment events from Razorpay and updates internal state.
 * Features:
 *   - HMAC-SHA256 signature verification (real, not stubbed)
 *   - Webhook idempotency (eventId deduplication)
 *   - State machine validation
 *
 * POST /api/webhooks/razorpay
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { updatePaymentTransactionState } from "@/lib/ledger/ledger.service";
import { PaymentStateMachine } from "@/lib/payment/state-machine";
import type { PaymentState } from "@/lib/ledger/types";
import { logAuditEvent } from "@/lib/security/audit";

// ─── Webhook Payload Types ──────────────────────────────────────

interface RazorpayWebhookPayload {
  event: string;
  payload: {
    payment?: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        method: string;
        captured: boolean;
        created_at: number;
      };
    };
    order?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        receipt: string;
        created_at: number;
      };
    };
  };
}

// ─── Webhook Event Store (Idempotency) ──────────────────────────

interface WebhookEventRecord {
  eventId: string;
  provider: string;
  receivedAt: string;
  processedAt?: string;
  status: "PENDING" | "PROCESSED" | "DUPLICATE";
  payloadHash: string;
}

// In-memory store for demo mode; use Appwrite in production
const webhookEventStore = new Map<string, WebhookEventRecord>();

function hashPayload(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

// ─── Webhook Event → Payment State Mapping ──────────────────────

const EVENT_TO_PAYMENT_STATE: Record<string, string> = {
  "payment.authorized": "PROCESSING",
  "payment.captured": "SUCCESS",
  "payment.failed": "FAILED",
};

// ─── Signature Verification ─────────────────────────────────────

function verifyWebhookSignature(
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

// ─── Handler ────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Clone request to read raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature") || "";

    // ── Signature Verification ──────────────────────────────────
    const webhookSecret =
      process.env.RAZORPAY_WEBHOOK_SECRET ||
      process.env.RAZORPAY_KEY_SECRET ||
      "";

    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      // Production: verify webhook signature
      if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        await logAuditEvent("WEBHOOK_INVALID_SIGNATURE", "system", {
          signaturePrefix: signature.slice(0, 8) + "...",
        });
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    }

    const body = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const { event, payload: webhookPayload } = body || {};

    // ── Idempotency Check ───────────────────────────────────────
    const eventId =
      request.headers.get("x-razorpay-event-id") ||
      `${event}_${webhookPayload?.payment?.entity?.id || webhookPayload?.order?.entity?.id || Date.now()}_${Date.now()}`;

    const existingEvent = webhookEventStore.get(eventId);
    if (existingEvent && existingEvent.status === "PROCESSED") {
      return NextResponse.json({
        success: true,
        message: `Event ${eventId} already processed (idempotent)`,
        duplicate: true,
      });
    }

    // Record event as PENDING
    webhookEventStore.set(eventId, {
      eventId,
      provider: "razorpay",
      receivedAt: new Date().toISOString(),
      status: "PENDING",
      payloadHash: hashPayload(body),
    });

    // ── Extract transaction reference ───────────────────────────
    const orderId =
      webhookPayload?.order?.entity?.id ||
      webhookPayload?.payment?.entity?.order_id;
    const paymentId = webhookPayload?.payment?.entity?.id || "";

    if (!orderId) {
      webhookEventStore.set(eventId, {
        ...webhookEventStore.get(eventId)!,
        status: "PROCESSED",
        processedAt: new Date().toISOString(),
      });
      return NextResponse.json(
        { error: "Missing order_id in webhook payload" },
        { status: 400 },
      );
    }

    // Find the internal transaction by provider order ID (indexed lookup)
    const { getPaymentTransactionByProviderOrderId } =
      await import("@/lib/ledger/ledger.service");
    const transaction = await getPaymentTransactionByProviderOrderId(orderId);

    if (!transaction) {
      await logAuditEvent("WEBHOOK_UNKNOWN_TRANSACTION", "system", {
        event,
        orderId,
        paymentId,
      });

      webhookEventStore.set(eventId, {
        ...webhookEventStore.get(eventId)!,
        status: "PROCESSED",
        processedAt: new Date().toISOString(),
      });

      return NextResponse.json(
        { error: "Transaction not found for order", orderId },
        { status: 404 },
      );
    }

    // ── Map webhook event to payment state ──────────────────────
    const targetState = EVENT_TO_PAYMENT_STATE[event];
    if (!targetState) {
      await logAuditEvent("WEBHOOK_UNHANDLED_EVENT", "system", {
        event,
        transactionId: transaction.id,
        orderId,
      });

      webhookEventStore.set(eventId, {
        ...webhookEventStore.get(eventId)!,
        status: "PROCESSED",
        processedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Event ${event} acknowledged (no state change)`,
      });
    }

    // ── Validate state transition ───────────────────────────────
    const transition = PaymentStateMachine.canTransitionPayment(
      transaction.paymentState,
      targetState as PaymentState,
    );

    if (!transition.allowed) {
      await logAuditEvent("WEBHOOK_OUT_OF_ORDER", "system", {
        event,
        currentState: transaction.paymentState,
        attemptedState: targetState,
        transactionId: transaction.id,
        reason: transition.reason,
      });

      webhookEventStore.set(eventId, {
        ...webhookEventStore.get(eventId)!,
        status: "PROCESSED",
        processedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message: `Out-of-order webhook: ${event} rejected (${transition.reason})`,
        rejected: true,
        reason: transition.reason,
      });
    }

    // ── Apply state transition ──────────────────────────────────
    await updatePaymentTransactionState(
      transaction.id,
      targetState as PaymentState,
      transaction.settlementState,
      { providerPaymentId: paymentId },
    );

    // Mark event as processed
    webhookEventStore.set(eventId, {
      ...webhookEventStore.get(eventId)!,
      status: "PROCESSED",
      processedAt: new Date().toISOString(),
    });

    await logAuditEvent("WEBHOOK_PROCESSED", "system", {
      event,
      transactionId: transaction.id,
      orderId,
      paymentId,
      previousState: transaction.paymentState,
      newState: targetState,
    });

    return NextResponse.json({
      success: true,
      message: `Webhook ${event} processed: ${transaction.paymentState} → ${targetState}`,
      transactionId: transaction.id,
    });
  } catch (error: unknown) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
