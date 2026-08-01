"use client";

import { useState, useCallback } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRazorpayOrder, verifyRazorpayPayment, recordRazorpayPayment } from "@/lib/actions/razorpay.actions";
import { formatAmount } from "@/lib/utils";
import { Loader2, CheckCircle, Smartphone, CreditCard, Building2, Wallet } from "lucide-react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

type PaymentMethod = "upi" | "card" | "netbanking" | "wallet";

interface RazorpayCheckoutProps {
  onSuccess?: () => void;
}

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: "upi", label: "UPI", icon: <Smartphone size={20} /> },
  { id: "card", label: "Card", icon: <CreditCard size={20} /> },
  { id: "netbanking", label: "Netbanking", icon: <Building2 size={20} /> },
  { id: "wallet", label: "Wallet", icon: <Wallet size={20} /> },
];

const RazorpayCheckout = ({ onSuccess }: RazorpayCheckoutProps) => {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("upi");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "success">("form");
  const [paidAmount, setPaidAmount] = useState(0);

  const handlePayment = useCallback(async () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Create order via server action
      const orderResult = await createRazorpayOrder(numAmount, "INR");

      if (!orderResult.success || !orderResult.orderId) {
        setError(orderResult.error || "Failed to create payment order.");
        setIsLoading(false);
        return;
      }

      // Demo mode — simulate payment without Razorpay modal
      if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        const mockPaymentId = `pay_demo_${Date.now()}`;
        const mockSignature = "demo_signature";

        // Verify
        const verifyResult = await verifyRazorpayPayment(
          orderResult.orderId,
          mockPaymentId,
          mockSignature
        );

        if (!verifyResult.success) {
          setError(verifyResult.error || "Payment verification failed.");
          setIsLoading(false);
          return;
        }

        // Record
        const recordResult = await recordRazorpayPayment({
          razorpayOrderId: orderResult.orderId,
          razorpayPaymentId: mockPaymentId,
          amount: numAmount,
          currency: "INR",
          method: selectedMethod,
          description: description || `Payment via ${selectedMethod.toUpperCase()}`,
        });

        if (!recordResult.success) {
          setError(recordResult.error || "Failed to record payment.");
          setIsLoading(false);
          return;
        }

        setPaidAmount(numAmount);
        setStep("success");
        setIsLoading(false);
        return;
      }

      // Real mode — open Razorpay modal
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: Math.round(numAmount * 100),
        currency: "INR",
        name: "BankVerse",
        description: description || `Payment via ${selectedMethod.toUpperCase()}`,
        order_id: orderResult.orderId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (response: any) => {
          const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = response;

          const verifyResult = await verifyRazorpayPayment(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
          );

          if (!verifyResult.success) {
            setError(verifyResult.error || "Payment verification failed.");
            setIsLoading(false);
            return;
          }

          const recordResult = await recordRazorpayPayment({
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            amount: numAmount,
            currency: "INR",
            method: selectedMethod,
            description: description || `Payment via ${selectedMethod.toUpperCase()}`,
          });

          if (!recordResult.success) {
            setError(recordResult.error || "Failed to record payment.");
            setIsLoading(false);
            return;
          }

          setPaidAmount(numAmount);
          setStep("success");
          setIsLoading(false);
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
          },
        },
        prefill: {
          name: "BankVerse User",
          email: "user@bankverse.com",
        },
        theme: {
          color: "#0179FE",
        },
      };

      const rzp = new window.Razorpay(options);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rzp.on("payment.failed", (response: any) => {
        setError(`Payment failed: ${response.error?.description || "Unknown error"}`);
        setIsLoading(false);
      });
      rzp.open();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }, [amount, description, selectedMethod]);

  if (step === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-24 font-semibold text-gray-900">Payment Successful!</h2>
          <p className="text-16 text-gray-600 mt-2">
            Your payment of {formatAmount(paidAmount)} via {selectedMethod.toUpperCase()} has been completed.
          </p>
        </div>
        <Button onClick={onSuccess} className="bg-bankGradient">
          Done
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Load Razorpay checkout script (not needed in demo mode but included for real mode) */}
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="lazyOnload"
      />

      <div className="flex flex-col gap-6">
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            {error}
          </div>
        )}

        {/* Amount */}
        <div className="form-item">
          <Label className="form-label">Amount (INR)</Label>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="input-class"
          />
        </div>

        {/* Description */}
        <div className="form-item">
          <Label className="form-label">Note (Optional)</Label>
          <Input
            placeholder="What's this payment for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-class"
          />
        </div>

        {/* Payment Method Selection */}
        <div className="form-item">
          <Label className="form-label">Payment Method</Label>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedMethod(method.id)}
                className={`flex items-center gap-3 rounded-lg border p-4 transition-all ${
                  selectedMethod === method.id
                    ? "border-bankGradient bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {method.icon}
                <span className="text-14 font-medium">{method.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Pay Button */}
        <Button
          onClick={handlePayment}
          disabled={isLoading || !amount}
          className="form-btn bg-bankGradient w-full"
        >
          {isLoading ? (
            <>
              <Loader2 size={16} className="animate-spin mr-2" />
              Processing...
            </>
          ) : (
            `Pay ${amount ? formatAmount(Number(amount)) : ""} via ${selectedMethod.toUpperCase()}`
          )}
        </Button>
      </div>
    </>
  );
};

export default RazorpayCheckout;
