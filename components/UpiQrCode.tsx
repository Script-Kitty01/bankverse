"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createRazorpayOrder,
  verifyRazorpayPayment,
  recordRazorpayPayment,
} from "@/lib/actions/razorpay.actions";
import { formatAmount } from "@/lib/utils";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, CheckCircle, Copy, Smartphone } from "lucide-react";

interface UpiQrCodeProps {
  onSuccess?: () => void;
}

const UPI_ID = "bankverse@upi";

const UpiQrCode = ({ onSuccess }: UpiQrCodeProps) => {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "success">("form");
  const [paidAmount, setPaidAmount] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleCopyUpiId = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulatePayment = async () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const orderResult = await createRazorpayOrder(numAmount, "INR");

      if (!orderResult.success || !orderResult.orderId) {
        setError(orderResult.error || "Failed to create payment order.");
        setIsLoading(false);
        return;
      }

      const mockPaymentId = `pay_upi_${Date.now()}`;
      const mockSignature = "upi_demo_signature";

      const verifyResult = await verifyRazorpayPayment(
        orderResult.orderId,
        mockPaymentId,
        mockSignature,
      );

      if (!verifyResult.success) {
        setError(verifyResult.error || "Payment verification failed.");
        setIsLoading(false);
        return;
      }

      const recordResult = await recordRazorpayPayment({
        razorpayOrderId: orderResult.orderId,
        razorpayPaymentId: mockPaymentId,
        amount: numAmount,
        currency: "INR",
        method: "upi",
        description: description || "UPI Payment",
      });

      if (!recordResult.success) {
        setError(recordResult.error || "Failed to record payment.");
        setIsLoading(false);
        return;
      }

      setPaidAmount(numAmount);
      setStep("success");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-24 font-semibold text-gray-900">
            Payment Received!
          </h2>
          <p className="text-16 text-gray-600 mt-2">
            Your UPI payment of {formatAmount(paidAmount)} has been confirmed.
          </p>
        </div>
        <Button onClick={onSuccess} className="bg-bankGradient">
          Done
        </Button>
      </div>
    );
  }

  return (
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

      {/* QR Code Display */}
      <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-6">
        <div className="flex items-center justify-center rounded-xl bg-white p-4 border-2 border-gray-200">
          <QRCodeSVG
            value={
              amount
                ? `upi://pay?pa=${UPI_ID}&pn=BankVerse&am=${amount}&tn=${encodeURIComponent(description || "Payment")}&cu=INR`
                : `upi://pay?pa=${UPI_ID}&pn=BankVerse&cu=INR`
            }
            size={160}
            level="M"
            includeMargin={true}
          />
        </div>

        <p className="text-14 text-gray-500 text-center">
          Scan this QR code with any UPI app to pay
        </p>

        {/* UPI ID */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5">
          <Smartphone size={16} className="text-purple-600" />
          <span className="text-14 font-mono font-medium text-gray-900">
            {UPI_ID}
          </span>
          <button
            type="button"
            onClick={handleCopyUpiId}
            className="ml-2 rounded-md p-1 hover:bg-gray-100 transition-colors"
            title="Copy UPI ID"
          >
            <Copy
              size={14}
              className={copied ? "text-green-600" : "text-gray-400"}
            />
          </button>
        </div>
        {copied && <p className="text-12 text-green-600">UPI ID copied!</p>}
      </div>

      {/* Simulate Payment Button */}
      <Button
        onClick={handleSimulatePayment}
        disabled={isLoading || !amount}
        className="form-btn bg-bankGradient w-full"
      >
        {isLoading ? (
          <>
            <Loader2 size={16} className="animate-spin mr-2" />
            Processing...
          </>
        ) : (
          `Simulate UPI Payment ${amount ? formatAmount(Number(amount)) : ""}`
        )}
      </Button>

      <p className="text-12 text-gray-400 text-center">
        In production, this would verify the UPI callback from Razorpay.
      </p>
    </div>
  );
};

export default UpiQrCode;
