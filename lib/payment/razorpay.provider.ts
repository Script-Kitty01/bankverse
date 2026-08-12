/**
 * BankVerse — Razorpay Payment Provider
 *
 * Wraps the existing Razorpay actions into the PaymentProvider interface.
 * Used in production mode (NEXT_PUBLIC_DEMO_MODE=false).
 */

import Razorpay from "razorpay";
import crypto from "crypto";
import type {
  PaymentProvider,
  PaymentProviderConfig,
  CreateOrderParams,
  CreateOrderResult,
  VerifyPaymentParams,
  VerifyPaymentResult,
  CapturePaymentParams,
  CapturePaymentResult,
  RefundPaymentParams,
  RefundPaymentResult,
} from "./provider.interface";

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly config: PaymentProviderConfig = { name: "razorpay", isMock: false };

  private client: Razorpay;

  constructor() {
    this.client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_demo123",
      key_secret: process.env.RAZORPAY_KEY_SECRET || "demo_secret_abc",
    });
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    try {
      const order = await this.client.orders.create({
        amount: Math.round(params.amount * 100), // paise
        currency: params.currency,
        receipt: params.receipt || `rcpt_${Date.now()}`,
        notes: params.notes || { source: "BankVerse" },
      });

      return {
        success: true,
        orderId: order.id,
        amount: Number(order.amount) / 100,
        currency: order.currency,
      };
    } catch (error: any) {
      console.error("Razorpay createOrder error:", error);
      return {
        success: false,
        error: error.message || "Failed to create order",
      };
    }
  }

  async verifyPayment(
    params: VerifyPaymentParams,
  ): Promise<VerifyPaymentResult> {
    try {
      const secret = process.env.RAZORPAY_KEY_SECRET || "";
      const body = params.orderId + "|" + params.paymentId;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body)
        .digest("hex");

      if (expectedSignature === params.signature) {
        return { success: true, paymentId: params.paymentId };
      }

      return { success: false, error: "Signature mismatch" };
    } catch (error: any) {
      console.error("Razorpay verifyPayment error:", error);
      return { success: false, error: error.message || "Verification failed" };
    }
  }

  async capturePayment(
    params: CapturePaymentParams,
  ): Promise<CapturePaymentResult> {
    try {
      const payment = await this.client.payments.capture(
        params.paymentId,
        Math.round(params.amount * 100),
        params.currency,
      );

      return {
        success: true,
        paymentId: payment.id,
        status: payment.status,
      };
    } catch (error: any) {
      console.error("Razorpay capturePayment error:", error);
      return { success: false, error: error.message || "Capture failed" };
    }
  }

  async refundPayment(
    params: RefundPaymentParams,
  ): Promise<RefundPaymentResult> {
    try {
      const refundPayload: Record<string, unknown> = {};
      if (params.amount) {
        refundPayload.amount = Math.round(params.amount * 100);
      }
      if (params.reason) {
        refundPayload.notes = { reason: params.reason };
      }

      const refund = await this.client.payments.refund(
        params.paymentId,
        refundPayload,
      );

      return {
        success: true,
        refundId: typeof refund === "string" ? refund : (refund as any).id,
      };
    } catch (error: any) {
      console.error("Razorpay refundPayment error:", error);
      return { success: false, error: error.message || "Refund failed" };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Lightweight check — try to fetch a non-existent order
      await this.client.orders.fetch("health_check");
      return true;
    } catch (error: any) {
      // Razorpay returns 404 for non-existent orders, which means it's reachable
      if (error?.statusCode === 404 || error?.code === 404) return true;
      return false;
    }
  }
}
