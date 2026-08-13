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
  GetPaymentStatusParams,
  GetPaymentStatusResult,
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
  /** Track order states so getPaymentStatus returns realistic data */
  private orderStore: Map<string, { status: string; paymentId?: string }> =
    new Map();

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
    const orderId = `mock_order_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    this.orderStore.set(orderId, { status: "created" });
    return {
      success: true,
      orderId,
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
    // Update order store — find matching orderId or last created order
    let updated = false;
    for (const [orderId, state] of this.orderStore) {
      if (
        params.paymentId.includes(orderId) ||
        state.paymentId === params.paymentId ||
        orderId === params.paymentId
      ) {
        state.status = "captured";
        state.paymentId = params.paymentId;
        updated = true;
        break;
      }
    }
    if (!updated && this.orderStore.size > 0) {
      // Fallback: update the last created order if specific ID match wasn't found
      const lastEntry = Array.from(this.orderStore.values()).pop();
      if (lastEntry) {
        lastEntry.status = "captured";
        lastEntry.paymentId = params.paymentId;
      }
    }
    return { success: true, paymentId: params.paymentId, status: "captured" };
  }

  async refundPayment(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  async getPaymentStatus(
    params: GetPaymentStatusParams,
  ): Promise<GetPaymentStatusResult> {
    await this.simulateLatency();
    const order = this.orderStore.get(params.orderId);
    if (!order) {
      return { success: false, status: "unknown", error: "Order not found" };
    }
    return {
      success: true,
      status: order.status as GetPaymentStatusResult["status"],
      paymentId: order.paymentId,
    };
  }

  async healthCheck(): Promise<boolean> {
    await this.simulateLatency();
    return !this.shouldFail();
  }
}
