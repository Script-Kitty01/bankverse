"use client";

import { useState, useCallback } from "react";
import Script from "next/script";
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
import {
  Loader2,
  CheckCircle,
  Smartphone,
  CreditCard,
  Building2,
  Copy,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Check,
} from "lucide-react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay: any;
  }
}

type PaymentMethod = "upi" | "card" | "netbanking";
type TransactionDirection = "send" | "receive";

interface RazorpayCheckoutProps {
  onSuccess?: () => void;
}

const UPI_ID = "bankverse@upi";

const POPULAR_BANKS = [
  { id: "hdfc", name: "HDFC Bank", code: "HDFC", bg: "bg-blue-900 text-white" },
  {
    id: "icici",
    name: "ICICI Bank",
    code: "ICIC",
    bg: "bg-orange-600 text-white",
  },
  {
    id: "sbi",
    name: "State Bank of India",
    code: "SBIN",
    bg: "bg-sky-600 text-white",
  },
  { id: "axis", name: "Axis Bank", code: "UTIB", bg: "bg-pink-900 text-white" },
  {
    id: "kotak",
    name: "Kotak Mahindra",
    code: "KKBK",
    bg: "bg-red-600 text-white",
  },
  {
    id: "pnb",
    name: "Punjab National Bank",
    code: "PUNB",
    bg: "bg-amber-800 text-white",
  },
];

const ALL_BANKS = [
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "IDFC FIRST Bank",
  "IndusInd Bank",
  "YES Bank",
  "Federal Bank",
  "Indian Overseas Bank",
  "South Indian Bank",
  "Central Bank of India",
  "UCO Bank",
  "Bank of India",
  "IDBI Bank",
  "Bandhan Bank",
  "RBL Bank",
];

const PAYMENT_METHODS: {
  id: PaymentMethod;
  label: string;
  icon: React.ReactNode;
}[] = [
  { id: "upi", label: "UPI", icon: <Smartphone size={18} /> },
  { id: "card", label: "Card", icon: <CreditCard size={18} /> },
  { id: "netbanking", label: "Netbanking", icon: <Building2 size={18} /> },
];

const RazorpayCheckout = ({ onSuccess }: RazorpayCheckoutProps) => {
  const [direction, setDirection] = useState<TransactionDirection>("send");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("upi");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"form" | "success">("form");
  const [paidAmount, setPaidAmount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Card details
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [showCvv, setShowCvv] = useState(false);
  const [saveCard, setSaveCard] = useState(false);

  // Netbanking details
  const [selectedBank, setSelectedBank] = useState("hdfc");
  const [otherBank, setOtherBank] = useState("");
  const [bankUserId, setBankUserId] = useState("");

  // UPI details
  const [customVpa, setCustomVpa] = useState("");

  const handleCopyUpiId = () => {
    navigator.clipboard.writeText(UPI_ID);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Detect card network brand
  const getCardBrand = (num: string) => {
    const clean = num.replace(/\D/g, "");
    if (clean.startsWith("4")) return "VISA";
    if (/^(5[1-5]|2[2-7])/.test(clean)) return "Mastercard";
    if (/^(60|65|81|82|88|89)/.test(clean)) return "RuPay";
    if (/^(34|37)/.test(clean)) return "Amex";
    return "Card";
  };

  // Format card number with spaces every 4 digits
  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 16);
    const formatted = raw.replace(/(.{4})/g, "$1 ").trim();
    setCardNumber(formatted);
  };

  // Format expiry MM/YY
  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    if (raw.length >= 3) {
      raw = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    }
    setCardExpiry(raw);
  };

  const handlePayment = useCallback(async () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid amount.");
      return;
    }

    // Validation per method
    if (selectedMethod === "card") {
      const cleanNum = cardNumber.replace(/\D/g, "");
      if (cleanNum.length < 15) {
        setError("Please enter a valid 16-digit card number.");
        return;
      }
      if (!cardHolder.trim()) {
        setError("Please enter cardholder name.");
        return;
      }
      if (!cardExpiry || cardExpiry.length < 5) {
        setError("Please enter card expiry date (MM/YY).");
        return;
      }
      if (!cardCvv || cardCvv.length < 3) {
        setError("Please enter 3 or 4 digit CVV.");
        return;
      }
    }

    if (selectedMethod === "netbanking") {
      if (selectedBank === "other" && !otherBank) {
        setError("Please select a bank for netbanking.");
        return;
      }
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

      const razorpayKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      const isDemoMode =
        !razorpayKey ||
        razorpayKey === "rzp_test_demo123" ||
        typeof window === "undefined" ||
        !window.Razorpay;

      const methodLabel =
        selectedMethod === "card"
          ? `Card (${getCardBrand(cardNumber)})`
          : selectedMethod === "netbanking"
            ? `Netbanking (${selectedBank === "other" ? otherBank : selectedBank.toUpperCase()})`
            : "UPI";

      const txDescription =
        description ||
        `${direction === "send" ? "Paid" : "Requested"} ${formatAmount(numAmount)} via ${methodLabel}`;

      // Demo / Simulated mode — complete payment without Razorpay modal
      if (isDemoMode) {
        const mockPaymentId = `pay_${selectedMethod}_${Date.now()}`;
        const mockSignature = "demo_signature";

        // Verify
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

        // Record
        const recordResult = await recordRazorpayPayment({
          razorpayOrderId: orderResult.orderId,
          razorpayPaymentId: mockPaymentId,
          amount: numAmount,
          currency: "INR",
          method: selectedMethod,
          description: txDescription,
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
        key: razorpayKey,
        amount: Math.round(numAmount * 100),
        currency: "INR",
        name: "BankVerse",
        description: txDescription,
        order_id: orderResult.orderId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: async (response: any) => {
          const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
            response;

          const verifyResult = await verifyRazorpayPayment(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
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
            description: txDescription,
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
          name: cardHolder || "BankVerse User",
          email: "user@bankverse.com",
        },
        theme: {
          color: "#0179FE",
        },
      };

      const rzp = new window.Razorpay(options);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rzp.on("payment.failed", (response: any) => {
        setError(
          `Payment failed: ${response.error?.description || "Unknown error"}`,
        );
        setIsLoading(false);
      });
      rzp.open();
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  }, [
    amount,
    description,
    selectedMethod,
    direction,
    cardNumber,
    cardHolder,
    cardExpiry,
    cardCvv,
    selectedBank,
    otherBank,
  ]);

  if (step === "success") {
    return (
      <div className="glass-card rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center gap-6 border border-emerald-500/20 animate-fade-in-scale">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-900/30">
          <CheckCircle size={40} className="text-white" />
        </div>
        <div className="text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-12 font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            {direction === "send" ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownLeft size={14} />
            )}
            {direction === "send" ? "PAYMENT SENT" : "PAYMENT REQUESTED"}
          </span>
          <h2 className="text-28 font-bold text-slate-50 tracking-tight">
            {direction === "send"
              ? "Transaction Completed!"
              : "Payment Link Generated!"}
          </h2>
          <p className="text-16 text-slate-400">
            {formatAmount(paidAmount)} via {selectedMethod.toUpperCase()}{" "}
            {selectedMethod === "card"
              ? `(${getCardBrand(cardNumber)})`
              : selectedMethod === "netbanking"
                ? `(${selectedBank === "other" ? otherBank : selectedBank.toUpperCase()})`
                : ""}
          </p>
        </div>

        <div className="w-full max-w-md rounded-xl bg-slate-800/50 p-4 border border-slate-700/60 text-14 space-y-2">
          <div className="flex justify-between text-slate-400">
            <span>Status</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1">
              <Check size={14} /> Settled
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Provider</span>
            <span className="font-medium text-slate-200">
              Razorpay Direct Gateway
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Transaction ID</span>
            <span className="font-mono text-slate-200 text-12">
              pay_{selectedMethod}_{Date.now().toString().slice(-6)}
            </span>
          </div>
        </div>

        <div className="flex gap-3 w-full max-w-md">
          <Button
            onClick={() => {
              setStep("form");
              setAmount("");
              setDescription("");
              setCardNumber("");
              setCardCvv("");
            }}
            variant="outline"
            className="flex-1 py-3 text-14"
          >
            New Payment
          </Button>
          <Button
            onClick={onSuccess}
            className="flex-1 py-3 text-14 font-semibold"
          >
            Done
          </Button>
        </div>
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
          <div className="rounded-xl bg-red-900/20 p-4 text-sm text-red-400 border border-red-800/50 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 font-bold ml-2 text-16"
            >
              ×
            </button>
          </div>
        )}

        {/* Direction Switcher: Send vs Receive */}
        <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700">
          <button
            type="button"
            onClick={() => setDirection("send")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-14 font-semibold transition-all ${
              direction === "send"
                ? "bg-slate-700 text-blue-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ArrowUpRight size={16} />
            Send Money (Pay)
          </button>
          <button
            type="button"
            onClick={() => setDirection("receive")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-14 font-semibold transition-all ${
              direction === "receive"
                ? "bg-slate-700 text-emerald-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <ArrowDownLeft size={16} />
            Receive / Request
          </button>
        </div>

        {/* Amount */}
        <div className="form-item">
          <Label className="form-label">Amount (INR ₹)</Label>
          <div className="relative">
            <span className="absolute left-3.5 top-3 text-18 font-semibold text-slate-400">
              ₹
            </span>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-class pl-8 text-18 font-semibold"
            />
          </div>
        </div>

        {/* Description / Memo */}
        <div className="form-item">
          <Label className="form-label">Payment Note / Reference</Label>
          <Input
            placeholder={
              direction === "send"
                ? "What is this payment for? (e.g. Invoice #1024, Services)"
                : "Reason for payment request"
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input-class"
          />
        </div>

        {/* Payment Method Selection */}
        <div className="form-item">
          <Label className="form-label">Select Razorpay Channel</Label>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedMethod(method.id)}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-3.5 transition-all ${
                  selectedMethod === method.id
                    ? "border-blue-500 bg-gradient-to-b from-blue-900/30 to-indigo-900/30 text-blue-400 shadow-md ring-2 ring-blue-500/20 font-semibold"
                    : "border-slate-700 bg-slate-800/70 text-slate-400 hover:border-blue-500 hover:bg-slate-700"
                }`}
              >
                {method.icon}
                <span className="text-13">{method.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* ================= CARD FORM ================= */}
        {selectedMethod === "card" && (
          <div className="flex flex-col gap-5 glass-card rounded-2xl p-6 border border-blue-800/30 bg-gradient-to-b from-blue-900/10 to-slate-900/90">
            {/* Interactive Card Graphic */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 p-6 text-white shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <div className="space-y-1">
                  <p className="text-10 uppercase tracking-widest text-blue-200 font-semibold">
                    BankVerse Card
                  </p>
                  <div className="h-6 w-9 rounded bg-gradient-to-r from-yellow-300 to-amber-500 opacity-90 shadow-sm flex items-center justify-center">
                    <div className="h-4 w-7 border border-amber-700/40 rounded-sm" />
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-md text-12 font-extrabold tracking-wider bg-white/10 backdrop-blur-sm border border-white/20 text-white">
                  {getCardBrand(cardNumber)}
                </span>
              </div>

              <p className="font-mono text-18 md:text-20 tracking-widest my-4 font-semibold">
                {cardNumber || "•••• •••• •••• ••••"}
              </p>

              <div className="flex justify-between items-end text-12">
                <div>
                  <p className="text-10 text-blue-200/60 uppercase font-medium">
                    Cardholder
                  </p>
                  <p className="font-semibold uppercase tracking-wider text-white/90">
                    {cardHolder || "YOUR NAME"}
                  </p>
                </div>
                <div>
                  <p className="text-10 text-blue-200/60 uppercase font-medium">
                    Expires
                  </p>
                  <p className="font-mono font-semibold text-white/90">
                    {cardExpiry || "MM/YY"}
                  </p>
                </div>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="form-item">
                <Label className="form-label text-13">Cardholder Name</Label>
                <Input
                  placeholder="e.g. Rahul Sharma"
                  value={cardHolder}
                  onChange={(e) => setCardHolder(e.target.value)}
                  className="input-class uppercase"
                />
              </div>

              <div className="form-item">
                <Label className="form-label text-13">Card Number</Label>
                <div className="relative">
                  <Input
                    placeholder="4532 8901 2345 6789"
                    value={cardNumber}
                    onChange={handleCardNumberChange}
                    className="input-class font-mono tracking-wider"
                  />
                  <span className="absolute right-3 top-3 text-12 font-bold text-blue-400">
                    {getCardBrand(cardNumber)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-item">
                  <Label className="form-label text-13">Expiry Date</Label>
                  <Input
                    placeholder="MM/YY"
                    value={cardExpiry}
                    onChange={handleExpiryChange}
                    className="input-class font-mono"
                  />
                </div>

                <div className="form-item">
                  <Label className="form-label text-13">CVV / CVC</Label>
                  <div className="relative">
                    <Input
                      type={showCvv ? "text" : "password"}
                      maxLength={4}
                      placeholder="•••"
                      value={cardCvv}
                      onChange={(e) =>
                        setCardCvv(
                          e.target.value.replace(/\D/g, "").slice(0, 4),
                        )
                      }
                      className="input-class font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCvv(!showCvv)}
                      className="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
                    >
                      {showCvv ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="saveCard"
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  className="rounded border-slate-600 text-blue-500 focus:ring-blue-500 h-4 w-4 bg-slate-800"
                />
                <label
                  htmlFor="saveCard"
                  className="text-13 text-slate-400 cursor-pointer"
                >
                  Save card securely for 1-click Razorpay transactions
                </label>
              </div>
            </div>
          </div>
        )}

        {/* ================= NETBANKING FORM ================= */}
        {selectedMethod === "netbanking" && (
          <div className="flex flex-col gap-5 glass-card rounded-2xl p-6 border border-amber-800/30 bg-gradient-to-b from-amber-900/10 to-slate-900/90">
            <Label className="form-label text-14">Popular Indian Banks</Label>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {POPULAR_BANKS.map((bank) => (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => setSelectedBank(bank.id)}
                  className={`flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all ${
                    selectedBank === bank.id
                      ? "border-amber-500 bg-amber-900/20 shadow-md ring-2 ring-amber-500/20 font-bold"
                      : "border-slate-700 bg-slate-800 hover:border-amber-500"
                  }`}
                >
                  <span
                    className={`px-2 py-0.5 rounded text-10 font-mono font-bold mb-1 ${bank.bg}`}
                  >
                    {bank.code}
                  </span>
                  <span className="text-12 text-slate-300 font-medium text-center">
                    {bank.name}
                  </span>
                </button>
              ))}
            </div>

            <div className="form-item pt-2">
              <Label className="form-label text-13">Or Select Other Bank</Label>
              <select
                value={selectedBank === "other" ? otherBank : selectedBank}
                onChange={(e) => {
                  if (POPULAR_BANKS.some((b) => b.id === e.target.value)) {
                    setSelectedBank(e.target.value);
                  } else {
                    setSelectedBank("other");
                    setOtherBank(e.target.value);
                  }
                }}
                className="input-class w-full rounded-xl border border-slate-600 p-3 text-14 bg-slate-800"
              >
                <option value="">Choose your bank</option>
                {ALL_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-item">
              <Label className="form-label text-13">
                Bank User ID / Customer ID
              </Label>
              <Input
                placeholder="Enter netbanking User ID or CIF"
                value={bankUserId}
                onChange={(e) => setBankUserId(e.target.value)}
                className="input-class"
              />
            </div>

            <div className="flex items-center gap-2.5 rounded-xl bg-blue-900/20 p-3 border border-blue-800/30 text-12 text-blue-400">
              <ShieldCheck size={18} className="text-blue-400 shrink-0" />
              <span>
                You will be redirected to the official bank netbanking gateway
                with 256-bit SSL encryption.
              </span>
            </div>
          </div>
        )}

        {/* UPI QR Code Section */}
        {selectedMethod === "upi" && (
          <div className="flex flex-col items-center gap-4 glass-card rounded-2xl p-6 border border-purple-800/30 bg-gradient-to-b from-purple-900/10 to-slate-900/80">
            <div className="flex items-center justify-center rounded-xl bg-slate-800 p-4 border-2 border-purple-800/50 shadow-inner">
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

            <p className="text-14 text-slate-400 text-center font-medium">
              Scan this QR code with Google Pay, PhonePe, Paytm or any UPI app
            </p>

            {/* Copyable UPI ID */}
            <div className="flex items-center gap-2 rounded-lg border border-purple-800/50 bg-slate-800 px-4 py-2 shadow-sm">
              <Smartphone size={16} className="text-purple-400" />
              <span className="text-14 font-mono font-semibold text-slate-100">
                {UPI_ID}
              </span>
              <button
                type="button"
                onClick={handleCopyUpiId}
                className="ml-2 rounded-md p-1 hover:bg-purple-900/30 transition-colors text-purple-400"
                title="Copy UPI ID"
              >
                <Copy
                  size={14}
                  className={copied ? "text-emerald-400" : "text-purple-400"}
                />
              </button>
            </div>
            {copied && (
              <p className="text-12 text-emerald-400 font-medium">
                UPI VPA copied to clipboard!
              </p>
            )}

            <div className="w-full form-item pt-2 border-t border-purple-800/30">
              <Label className="form-label text-13">
                Or Pay / Request via Virtual Payment Address (VPA)
              </Label>
              <Input
                placeholder="e.g. alex@okaxis, merchant@ybl"
                value={customVpa}
                onChange={(e) => setCustomVpa(e.target.value)}
                className="input-class font-mono text-14"
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <Button
          onClick={handlePayment}
          disabled={isLoading || !amount}
          className="form-btn bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white w-full shadow-lg py-3.5 text-16 font-semibold"
        >
          {isLoading ? (
            <>
              <Loader2 size={18} className="animate-spin mr-2" />
              Processing Transaction...
            </>
          ) : (
            <>
              <Lock size={16} className="mr-2 opacity-80" />
              {direction === "send" ? "Pay" : "Request"}{" "}
              {amount ? formatAmount(Number(amount)) : "Amount"} via{" "}
              {selectedMethod.toUpperCase()}
            </>
          )}
        </Button>
      </div>
    </>
  );
};

export default RazorpayCheckout;
