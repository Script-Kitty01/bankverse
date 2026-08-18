"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createTransfer } from "@/lib/actions/dwolla.actions";
import { formatAmount } from "@/lib/utils";
import {
  Loader2,
  ArrowRight,
  CheckCircle,
  Building2,
  Smartphone,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  Check,
  Clock,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";
import RazorpayCheckout from "@/components/RazorpayCheckout";

const transferSchema = z.object({
  direction: z.enum(["send", "receive"]),
  sourceAccountId: z.string().min(1, "Select a source account"),
  destinationType: z.enum(["own", "external_bank", "email"]),
  destinationAccountId: z.string().optional(),
  recipientName: z.string().optional(),
  bankName: z.string().optional(),
  ifscCode: z.string().optional(),
  accountNumber: z.string().optional(),
  accountType: z.enum(["current", "savings"]).optional(),
  destinationEmail: z.string().email().optional(),
  transferSpeed: z.enum(["standard", "sameday"]).default("standard"),
  amount: z
    .string()
    .min(1, "Enter an amount")
    .refine(
      (val) => !isNaN(Number(val)) && Number(val) > 0,
      "Amount must be greater than 0",
    ),
  description: z.string().max(200).optional(),
});

type TransferFormData = z.infer<typeof transferSchema>;

type PaymentMethodTab = "imps_neft" | "razorpay";

const TransferForm = ({ accounts }: { accounts: Account[] }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [transferData, setTransferData] = useState<TransferFormData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodTab>("imps_neft");

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      direction: "send",
      sourceAccountId: "",
      destinationType: "own",
      destinationAccountId: "",
      recipientName: "",
      bankName: "",
      ifscCode: "",
      accountNumber: "",
      accountType: "savings",
      destinationEmail: "",
      transferSpeed: "standard",
      amount: "",
      description: "",
    },
  });

  const sourceAccountId = form.watch("sourceAccountId");
  const selectedAccount = accounts.find((a) => a.id === sourceAccountId);

  const onSubmit = (data: TransferFormData) => {
    setTransferData(data);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    if (!transferData) return;
    setIsLoading(true);
    setError(null);

    try {
      const result = await createTransfer({
        sourceFundingSourceUrl: transferData.sourceAccountId,
        destinationFundingSourceUrl:
          transferData.destinationAccountId ||
          transferData.destinationEmail ||
          "",
        amount: Number(transferData.amount),
        description: transferData.description,
      });

      if (result.success) {
        setStep("success");
      } else if ("error" in result) {
        setError(result.error ?? "Transfer failed. Please try again.");
        setStep("form");
      }
    } catch {
      setError("Transfer failed. Please try again.");
      setStep("form");
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="glass-card rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center gap-6 border border-emerald-500/20 animate-fade-in-scale">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-900/30">
          <CheckCircle size={40} className="text-white" />
        </div>
        <div className="text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-12 font-semibold bg-emerald-900/30 text-emerald-400 border border-emerald-500/20">
            {transferData?.direction === "send" ? (
              <ArrowUpRight size={14} />
            ) : (
              <ArrowDownLeft size={14} />
            )}
            {transferData?.direction === "send"
              ? "IMPS/NEFT DEBIT SUBMITTED"
              : "IMPS/NEFT REQUEST SENT"}
          </span>
          <h2 className="text-28 font-bold text-slate-50 tracking-tight">
            Transfer Initiated
          </h2>
          <p className="text-16 text-slate-400">
            {formatAmount(Number(transferData?.amount || 0))} via IMPS/NEFT
            Network
          </p>
        </div>

        <div className="w-full max-w-md rounded-xl bg-slate-800/60 p-4 border border-slate-700/50 text-14 space-y-2.5">
          <div className="flex justify-between text-slate-400">
            <span>Transfer Speed</span>
            <span className="font-semibold text-slate-200 capitalize">
              {transferData?.transferSpeed === "sameday"
                ? "IMPS (Instant)"
                : "NEFT (1-2 Hours)"}
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Fee</span>
            <span className="font-medium text-emerald-400">
              {transferData?.transferSpeed === "sameday"
                ? "₹5.00"
                : "₹0.00 (Free)"}
            </span>
          </div>
          <div className="flex justify-between text-slate-400">
            <span>Transaction Reference</span>
            <span className="font-mono text-slate-200 text-12">
              tr_imps_{Date.now().toString().slice(-6)}
            </span>
          </div>
        </div>

        <div className="flex gap-3 w-full max-w-md">
          <Button
            onClick={() => {
              setStep("form");
              form.reset();
            }}
            variant="outline"
            className="flex-1 py-3 text-14"
          >
            Another Transfer
          </Button>
          <Button
            onClick={() => router.push("/")}
            className="flex-1 py-3 text-14 font-semibold"
          >
            Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (step === "confirm" && transferData) {
    const sourceAcct = accounts.find(
      (a) => a.id === transferData.sourceAccountId,
    );
    const isSameDay = transferData.transferSpeed === "sameday";
    const fee = isSameDay ? 1.0 : 0.0;
    const totalAmount = Number(transferData.amount) + fee;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-900/30 text-blue-400 font-bold text-14">
            2
          </span>
          <h2 className="text-20 font-bold text-slate-100">
            Review & Confirm Bank Transfer
          </h2>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-4 border border-slate-700 shadow-md">
          <div className="flex justify-between text-14">
            <span className="text-slate-400">Direction</span>
            <span className="font-semibold text-slate-200 capitalize">
              {transferData.direction === "send"
                ? "Send Money (Debit)"
                : "Request Money (Direct Debit)"}
            </span>
          </div>

          <div className="flex justify-between text-14 border-t border-slate-700/50 pt-3">
            <span className="text-slate-400">From Funding Account</span>
            <span className="font-semibold text-slate-200">
              {sourceAcct?.name} (...{sourceAcct?.mask})
            </span>
          </div>

          <div className="flex justify-between text-14 border-t border-slate-700/50 pt-3">
            <span className="text-slate-400">To Recipient / Account</span>
            <span className="font-semibold text-slate-200">
              {transferData.destinationType === "own"
                ? accounts.find(
                    (a) => a.id === transferData.destinationAccountId,
                  )?.name || "Own Connected Account"
                : transferData.destinationType === "external_bank"
                  ? `${transferData.recipientName || "External Recipient"} (${transferData.bankName || "Indian Bank"} ••••${transferData.accountNumber?.slice(-4) || "0000"})`
                  : transferData.destinationEmail}
            </span>
          </div>

          <div className="flex justify-between text-14 border-t border-slate-700/50 pt-3">
            <span className="text-slate-400">Transfer Speed</span>
            <span className="font-semibold text-slate-200">
              {isSameDay
                ? "IMPS (Instant — 24×7)"
                : "NEFT (1-2 Hours — Bank Hours)"}
            </span>
          </div>

          <div className="flex justify-between text-14 border-t border-slate-700/50 pt-3">
            <span className="text-slate-400">Transfer Fee</span>
            <span className="font-medium text-emerald-400">
              {isSameDay ? "₹5.00" : "₹0.00 (Free)"}
            </span>
          </div>

          <div className="flex justify-between border-t border-slate-700/50 pt-4 text-16">
            <span className="font-bold text-slate-100">Total Debit</span>
            <span className="font-bold text-blue-400">
              {formatAmount(totalAmount)}
            </span>
          </div>

          {transferData.description && (
            <div className="flex justify-between border-t border-slate-700/50 pt-3 text-14">
              <span className="text-slate-400">Memo / Reference</span>
              <span className="text-slate-300">{transferData.description}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-blue-900/20 p-3.5 border border-blue-800/50 text-12 text-blue-300">
          <ShieldCheck size={18} className="text-blue-400 shrink-0" />
          <span>
            Protected by NPCI IMPS/NEFT Network security. Transactions settle
            through RBI-regulated banking standards.
          </span>
        </div>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => setStep("form")}
            className="flex-1 py-3"
            disabled={isLoading}
          >
            Back
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 py-3 font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Processing...
              </>
            ) : (
              "Confirm & Authorize"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Payment Method Tabs */}
      <div className="flex rounded-xl border border-slate-700 p-1 bg-slate-800/50 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setPaymentMethod("imps_neft")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2.5 text-14 font-medium transition-all ${
            paymentMethod === "imps_neft"
              ? "bg-slate-700 text-slate-100 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Building2 size={16} />
          Bank Transfer (IMPS/NEFT)
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod("razorpay")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2.5 text-14 font-medium transition-all ${
            paymentMethod === "razorpay"
              ? "bg-slate-700 text-slate-100 shadow-sm"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Smartphone size={16} />
          Razorpay / UPI
        </button>
      </div>

      {/* Bank Transfer Form */}
      {paymentMethod === "imps_neft" && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {error && (
              <div className="rounded-md bg-red-900/20 p-3 text-sm text-red-400 border border-red-800/50">
                {error}
              </div>
            )}

            {/* Direction Switcher */}
            <FormField
              control={form.control}
              name="direction"
              render={({ field }) => (
                <div className="flex rounded-xl bg-slate-800 p-1 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => field.onChange("send")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-14 font-semibold transition-all ${
                      field.value === "send"
                        ? "bg-slate-700 text-blue-400 shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ArrowUpRight size={16} />
                    Send via IMPS/NEFT
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange("receive")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-14 font-semibold transition-all ${
                      field.value === "receive"
                        ? "bg-slate-700 text-emerald-400 shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ArrowDownLeft size={16} />
                    Request Payment
                  </button>
                </div>
              )}
            />

            {/* Source Account */}
            <FormField
              control={form.control}
              name="sourceAccountId"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Funding Account</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="input-class w-full rounded-xl border border-slate-600 p-3 bg-slate-800 text-14"
                    >
                      <option value="">Select funding account</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} (...{account.mask}) —{" "}
                          {formatAmount(account.currentBalance)}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage className="mt-2 form-message" />
                </div>
              )}
            />

            {selectedAccount && (
              <p className="text-13 text-slate-400 font-medium">
                Available Balance:{" "}
                <span className="text-slate-200 font-semibold">
                  {formatAmount(selectedAccount.availableBalance)}
                </span>
              </p>
            )}

            {/* Destination Type */}
            <FormField
              control={form.control}
              name="destinationType"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">
                    Transfer Recipient Type
                  </FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => field.onChange("own")}
                        className={`py-2.5 px-3 rounded-xl border text-13 font-medium transition-all ${
                          field.value === "own"
                            ? "border-blue-500 bg-blue-900/30 text-blue-400 font-semibold"
                            : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        My Account
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange("external_bank")}
                        className={`py-2.5 px-3 rounded-xl border text-13 font-medium transition-all ${
                          field.value === "external_bank"
                            ? "border-blue-500 bg-blue-900/30 text-blue-400 font-semibold"
                            : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        External Indian Bank
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange("email")}
                        className={`py-2.5 px-3 rounded-xl border text-13 font-medium transition-all ${
                          field.value === "email"
                            ? "border-blue-500 bg-blue-900/30 text-blue-400 font-semibold"
                            : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        Email Invite
                      </button>
                    </div>
                  </FormControl>
                </div>
              )}
            />

            {/* Destination Account (own) */}
            {form.watch("destinationType") === "own" && (
              <FormField
                control={form.control}
                name="destinationAccountId"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">To Account</FormLabel>
                    <FormControl>
                      <select
                        {...field}
                        className="input-class w-full rounded-xl border border-slate-600 p-3 bg-slate-800 text-14"
                      >
                        <option value="">Select account</option>
                        {accounts
                          .filter((a) => a.id !== sourceAccountId)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.name} (...{account.mask})
                            </option>
                          ))}
                      </select>
                    </FormControl>
                    <FormMessage className="mt-2 form-message" />
                  </div>
                )}
              />
            )}

            {/* Destination External Bank Details */}
            {form.watch("destinationType") === "external_bank" && (
              <div className="space-y-4 p-5 rounded-2xl bg-blue-900/10 border border-blue-800/30">
                <p className="text-14 font-semibold text-slate-200 flex items-center gap-2">
                  <Building2 size={16} className="text-blue-400" />
                  External Indian Bank IFSC & Account Details
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="recipientName"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">
                          Recipient Full Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g. John Doe"
                            className="input-class"
                          />
                        </FormControl>
                      </div>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">
                          Bank Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g. HDFC Bank, ICICI Bank"
                            className="input-class"
                          />
                        </FormControl>
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="ifscCode"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">
                          11-Char IFSC Code
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            maxLength={11}
                            placeholder="HDFC0000123"
                            className="input-class font-mono"
                          />
                        </FormControl>
                      </div>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="accountNumber"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">
                          Account Number
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="883920194"
                            className="input-class font-mono"
                          />
                        </FormControl>
                      </div>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Destination Email */}
            {form.watch("destinationType") === "email" && (
              <FormField
                control={form.control}
                name="destinationEmail"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">
                      Recipient Email Address
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="recipient@example.com"
                        className="input-class"
                      />
                    </FormControl>
                    <FormMessage className="mt-2 form-message" />
                  </div>
                )}
              />
            )}

            {/* Transfer Speed Option */}
            <FormField
              control={form.control}
              name="transferSpeed"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Transfer Speed & Fee</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => field.onChange("standard")}
                        className={`p-3.5 rounded-xl border flex flex-col gap-1 transition-all ${
                          field.value === "standard"
                            ? "border-blue-500 bg-blue-900/30 text-blue-300 font-semibold ring-2 ring-blue-500/20"
                            : "border-slate-700 bg-slate-800 text-slate-400"
                        }`}
                      >
                        <span className="text-14 font-bold flex items-center gap-1.5">
                          <Clock size={16} className="text-blue-400" /> NEFT
                        </span>
                        <span className="text-12 text-emerald-400 font-medium">
                          ₹0.00 Fee • 1–2 Hours (Bank Hours)
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => field.onChange("sameday")}
                        className={`p-3.5 rounded-xl border flex flex-col gap-1 transition-all ${
                          field.value === "sameday"
                            ? "border-blue-500 bg-blue-900/30 text-blue-300 font-semibold ring-2 ring-blue-500/20"
                            : "border-slate-700 bg-slate-800 text-slate-400"
                        }`}
                      >
                        <span className="text-14 font-bold flex items-center gap-1.5">
                          <Clock size={16} className="text-purple-400" />{" "}
                          IMPS
                        </span>
                        <span className="text-12 text-purple-400 font-medium">
                          ₹5.00 Fee • Instant (24×7)
                        </span>
                      </button>
                    </div>
                  </FormControl>
                </div>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Amount</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="input-class"
                    />
                  </FormControl>
                  <FormMessage className="mt-2 form-message" />
                </div>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Note (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="What's this transfer for?"
                      className="input-class"
                    />
                  </FormControl>
                  <FormMessage className="mt-2 form-message" />
                </div>
              )}
            />

            <Button
              type="submit"
              className="form-btn bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white w-full shadow-md"
            >
              Continue <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>
        </Form>
      )}

      {/* Razorpay / UPI Payment */}
      {paymentMethod === "razorpay" && (
        <RazorpayCheckout onSuccess={() => router.push("/")} />
      )}
    </div>
  );
};

export default TransferForm;
