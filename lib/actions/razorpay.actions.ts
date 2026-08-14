"use server";

import Razorpay from "razorpay";
import { createPaymentRecord } from "@/lib/supabase/db";
import { getCurrentUser } from "./user.actions";
import { recordTransaction } from "@/lib/ledger/ledger.service";
import crypto from "crypto";

/**
 * Get a Razorpay client instance (server-only).
 */
function getRazorpayClient(): Razorpay {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_demo123",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "demo_secret_abc",
  });
}

/**
 * Create a Razorpay order for the given amount.
 * In demo mode, returns a mock order without calling the API.
 */
export const createRazorpayOrder = async (
  amount: number,
  currency = "INR",
): Promise<RazorpayOrderResponse> => {
  try {
    // Demo mode or missing/demo Razorpay keys — return mock order
    const isDemo =
      process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
      !process.env.RAZORPAY_KEY_ID ||
      process.env.RAZORPAY_KEY_ID.startsWith("rzp_test_demo");

    if (isDemo) {
      const mockOrderId = `order_demo_${Date.now()}`;
      return {
        success: true,
        orderId: mockOrderId,
        amount,
        currency,
      };
    }

    const razorpay = getRazorpayClient();

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Razorpay expects amount in paise
      currency,
      receipt: `rcpt_${Date.now()}`,
      notes: {
        source: "BankVerse",
      },
    });

    return {
      success: true,
      orderId: order.id,
      amount: Number(order.amount) / 100,
      currency: order.currency,
    };
  } catch (error) {
    console.error("createRazorpayOrder error:", error);
    return { success: false, error: "Failed to create payment order." };
  }
};

/**
 * Verify a Razorpay payment signature.
 * In demo mode, auto-verifies without checking the signature.
 */
export const verifyRazorpayPayment = async (
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<RazorpayVerifyResponse> => {
  try {
    // Demo mode or mock payment IDs — auto-verify
    const isDemo =
      process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
      orderId.startsWith("order_demo_") ||
      paymentId.startsWith("pay_demo_") ||
      paymentId.startsWith("pay_upi_") ||
      !process.env.RAZORPAY_KEY_SECRET ||
      process.env.RAZORPAY_KEY_SECRET === "demo_secret_abc";

    if (isDemo) {
      return { success: true, paymentId };
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || "";

    const body = orderId + "|" + paymentId;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature === signature) {
      return { success: true, paymentId };
    }

    return {
      success: false,
      error: "Payment verification failed — signature mismatch.",
    };
  } catch (error) {
    console.error("verifyRazorpayPayment error:", error);
    return { success: false, error: "Payment verification failed." };
  }
};

/**
 * Record a completed Razorpay payment in the database.
 * In demo mode, returns a mock payment record.
 */
export const recordRazorpayPayment = async (params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amount: number;
  currency: string;
  method: PaymentRecord["method"];
  description: string;
}): Promise<{ success: boolean; payment?: PaymentRecord; error?: string }> => {
  try {
    const user = await getCurrentUser();
    const userId = user?.userId || "demo-user";

    // 1. Record the payment in the payments collection
    const payment = await createPaymentRecord({
      userId,
      razorpayOrderId: params.razorpayOrderId,
      razorpayPaymentId: params.razorpayPaymentId,
      amount: params.amount,
      currency: params.currency,
      status: "paid",
      method: params.method,
      description: params.description,
    });

    // 2. Record a double-entry ledger transaction
    //    DEBIT the customer (money leaves their account)
    //    CREDIT the merchant (money enters the merchant account)
    const idempotencyKey = `rzp_${params.razorpayPaymentId}`;
    await recordTransaction({
      customerId: userId,
      merchantId: "bankverse_merchant",
      amount: params.amount,
      currency: params.currency,
      provider: "razorpay",
      providerReference: params.razorpayPaymentId,
      idempotencyKey,
      description: params.description,
    });

    return { success: true, payment };
  } catch (error) {
    console.error("recordRazorpayPayment error:", error);
    return { success: false, error: "Failed to record payment." };
  }
};
