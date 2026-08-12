/**
 * BankVerse — Mock Payment Provider
 *
 * Used in demo mode (NEXT_PUBLIC_DEMO_MODE=true).
 * Simulates all payment operations with configurable latency and failure rates.
 */

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

export interface MockProviderOptions {
  /** Simulated latency in ms (default: 200) */
  latency?: number;
  /** Probability of failure (0-1, default: 0) */
  failureRate?: number;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly config: PaymentProviderConfig = { name: "mock", isMock: true };

  private latency: number;
  private failureRate: number;

  constructor(options: MockProviderOptions = {}) {
    this.latency = options.latency ?? 200;
    this.failureRate = options.failureRate ?? 0;
  }

  private async simulateLatency(): Promise<void> {
    await new Promise((r) => setTimeout(r, this.latency));
  }

  private shouldFail(): boolean {
    return Math.random() < this.failureRate;
  }

  async createOrder(params: CreateOrderParams): Promise<CreateOrderResult> {
    await this.simulateLatency();
    if (this.shouldFail()) {
      return {
        success: false,
        error: "Mock: simulated order creation failure",
      };
    }
    return {
      success: true,
      orderId: `mock_order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      amount: params.amount,
      currency: params.currency,
    };
  }

  async verifyPayment(
    params: VerifyPaymentParams,
  ): Promise<VerifyPaymentResult> {
    await this.simulateLatency();
    if (this.shouldFail()) {
      return { success: false, error: "Mock: simulated verification failure" };
    }
    return { success: true, paymentId: params.paymentId };
  }

  async capturePayment(
    params: CapturePaymentParams,
  ): Promise<CapturePaymentResult> {
    await this.simulateLatency();
    if (this.shouldFail()) {
      return { success: false, error: "Mock: simulated capture failure" };
    }
    return { success: true, paymentId: params.paymentId, status: "captured" };
  }

  async refundPayment(
    params: RefundPaymentParams,
  ): Promise<RefundPaymentResult> {
    await this.simulateLatency();
    if (this.shouldFail()) {
      return { success: false, error: "Mock: simulated refund failure" };
    }
    return {
      success: true,
      refundId: `mock_refund_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
  }

  async healthCheck(): Promise<boolean> {
    await this.simulateLatency();
    return !this.shouldFail();
  }
}
