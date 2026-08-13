/**
 * BankVerse — Payment Provider Interface
 *
 * All payment providers (Razorpay, mock, future Stripe, etc.) implement this.
 * The orchestrator calls these methods without knowing which provider is active.
 */

export interface PaymentProviderConfig {
  name: string;
  isMock: boolean;
}

export interface CreateOrderParams {
  amount: number;
  currency: string;
  receipt?: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  amount?: number;
  currency?: string;
  error?: string;
}

export interface VerifyPaymentParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  paymentId?: string;
  error?: string;
}

export interface CapturePaymentParams {
  paymentId: string;
  amount: number;
  currency: string;
}

export interface CapturePaymentResult {
  success: boolean;
  paymentId?: string;
  status?: string;
  error?: string;
}

export interface RefundPaymentParams {
  paymentId: string;
  amount?: number; // partial refund if provided
  reason?: string;
}

export interface RefundPaymentResult {
  success: boolean;
  refundId?: string;
  error?: string;
}

export interface GetPaymentStatusParams {
  orderId: string;
}

export interface GetPaymentStatusResult {
  success: boolean;
  status:
    | "created"
    | "authorized"
    | "captured"
    | "failed"
    | "refunded"
    | "unknown";
  paymentId?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly config: PaymentProviderConfig;

  /** Create a payment order (authorization) */
  createOrder(params: CreateOrderParams): Promise<CreateOrderResult>;

  /** Verify payment signature/webhook */
  verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;

  /** Capture an authorized payment */
  capturePayment(params: CapturePaymentParams): Promise<CapturePaymentResult>;

  /** Refund a captured payment */
  refundPayment(params: RefundPaymentParams): Promise<RefundPaymentResult>;

  /** Query the provider for the current status of a payment */
  getPaymentStatus(
    params: GetPaymentStatusParams,
  ): Promise<GetPaymentStatusResult>;

  /** Health check — is the provider reachable? */
  healthCheck(): Promise<boolean>;
}
