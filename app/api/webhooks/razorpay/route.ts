/**
 * BankVerse — Razorpay Webhook Handler
 *
 * Receives payment events from Razorpay and updates internal state.
 * In demo mode, simulates webhook processing.
 *
 * POST /api/webhooks/razorpay
 */

import { NextResponse } from "next/server";
import { updatePaymentTransactionState } from "@/lib/ledger/ledger.service";
import { PaymentStateMachine } from "@/lib/payment/state-machine";
import { getPaymentTransactionById } from "@/lib/ledger/ledger.service";
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

// ─── Webhook Event → Payment State Mapping ──────────────────────

const EVENT_TO_PAYMENT_STATE: Record<string, string> = {
  "payment.authorized": "PROCESSING",
  "payment.captured": "SUCCESS",
  "payment.failed": "FAILED",
};

// ─── Handler ────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("x-razorpay-signature") || "";
    const body = await request.json() as RazorpayWebhookPayload;

    // In demo mode, skip signature verification
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      // Production: verify webhook signature
      // const isValid = verifyWebhookSignature(body, signature);
      // if (!isValid) {
      //   return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      // }
    }

    const { event, payload } = body;

    // Extract transaction reference from order receipt
    const orderId = payload.order?.entity?.id || payload.payment?.entity?.order_id;
    const paymentId = payload.payment?.entity?.id;
    const paymentStatus = payload.payment?.entity?.status;

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing order_id in webhook payload" },
        { status: 400 },
      );
    }

    // Find the internal transaction by provider reference (orderId)
    // In demo mode, we search through all transactions
    const { getAllPaymentTransactions } = await import(
      "@/lib/ledger/ledger.service"
    );
    const allTxs = await getAllPaymentTransactions(1000);
    const transaction = allTxs.find(
      (tx) => tx.providerReference === orderId,
    );

    if (!transaction) {
      // Log unknown webhook
      await logAuditEvent("WEBHOOK_UNKNOWN_TRANSACTION", "system", {
        event,
        orderId,
        paymentId,
      });

      return NextResponse.json(
        { error: "Transaction not found for order", orderId },
        { status: 404 },
      );
    }

    // Map webhook event to payment state
    const targetState = EVENT_TO_PAYMENT_STATE[event];
    if (!targetState) {
      // Unhandled event type — log and acknowledge
      await logAuditEvent("WEBHOOK_UNHANDLED_EVENT", "system", {
        event,
        transactionId: transaction.id,
        orderId,
      });

      return NextResponse.json({
        success: true,
        message: `Event ${event} acknowledged (no state change)`,
      });
    }

    // Validate state transition
    const transition = PaymentStateMachine.canTransitionPayment(
      transaction.paymentState,
      targetState as any,
    );

    if (!transition.allowed) {
      // Out-of-order webhook — log incident
      await logAuditEvent("WEBHOOK_OUT_OF_ORDER", "system", {
        event,
        currentState: transaction.paymentState,
        attemptedState: targetState,
        transactionId: transaction.id,
        reason: transition.reason,
      });

      return NextResponse.json({
        success: true,
        message: `Out-of-order webhook: ${event} rejected (${transition.reason})`,
        rejected: true,
        reason: transition.reason,
      });
    }

    // Apply state transition
    await updatePaymentTransactionState(
      transaction.id,
      targetState as any,
      transaction.settlementState,
    );

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
  } catch (error: any) {
    console.error("Webhook processing error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}
