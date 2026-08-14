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
  routingNumber: z.string().optional(),
  accountNumber: z.string().optional(),
  accountType: z.enum(["checking", "savings"]).optional(),
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

type PaymentMethodTab = "ach" | "razorpay";

const TransferForm = ({ accounts }: { accounts: Account[] }) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"form" | "confirm" | "success">("form");
  const [transferData, setTransferData] = useState<TransferFormData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodTab>("ach");

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      direction: "send",
      sourceAccountId: "",
      destinationType: "own",
      destinationAccountId: "",
      recipientName: "",
      bankName: "",
      routingNumber: "",
      accountNumber: "",
      accountType: "checking",
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
      <div className="glass-card rounded-2xl p-8 md:p-12 flex flex-col items-center justify-center gap-6 border border-emerald-100 bg-gradient-to-b from-emerald-50/30 to-white/90 shadow-xl">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-green-500 shadow-lg">
          <CheckCircle size={40} className="text-white" />
        </div>
        <div className="text-center space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-12 font-semibold bg-emerald-100 text-emerald-800">
            {transferData?.direction === "send" ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
            {transferData?.direction === "send" ? "ACH DEBIT SUBMITTED" : "ACH REQUEST SENT"}
          </span>
          <h2 className="text-28 font-bold text-gray-900">
            ACH Transfer Initiated!
          </h2>
          <p className="text-16 text-gray-600">
            {formatAmount(Number(transferData?.amount || 0))} via Dwolla ACH Network
          </p>
        </div>

        <div className="w-full max-w-md rounded-xl bg-gray-50/80 p-4 border border-gray-200 text-14 space-y-2.5">
          <div className="flex justify-between text-gray-600">
            <span>Transfer Speed</span>
            <span className="font-semibold text-gray-900 capitalize">
              {transferData?.transferSpeed === "sameday" ? "Same-Day ACH" : "Standard (1-2 Days)"}
            </span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Fee</span>
            <span className="font-medium text-emerald-600">
              {transferData?.transferSpeed === "sameday" ? "$1.00" : "$0.00 (Free)"}
            </span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Dwolla Reference</span>
            <span className="font-mono text-gray-900 text-12">
              tr_dwolla_{Date.now().toString().slice(-6)}
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
            className="flex-1 py-3 text-14 border-gray-300"
          >
            Another Transfer
          </Button>
          <Button
            onClick={() => router.push("/")}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md py-3 text-14 font-semibold"
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
          <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-14">
            2
          </span>
          <h2 className="text-20 font-bold text-gray-900">
            Review & Confirm ACH Transfer
          </h2>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-4 border border-blue-100 bg-white shadow-md">
          <div className="flex justify-between text-14">
            <span className="text-gray-500">Direction</span>
            <span className="font-semibold text-gray-900 capitalize">
              {transferData.direction === "send" ? "Send Money (Debit)" : "Request Money (Direct Debit)"}
            </span>
          </div>

          <div className="flex justify-between text-14 border-t pt-3">
            <span className="text-gray-500">From Funding Account</span>
            <span className="font-semibold text-gray-900">
              {sourceAcct?.name} (...{sourceAcct?.mask})
            </span>
          </div>

          <div className="flex justify-between text-14 border-t pt-3">
            <span className="text-gray-500">To Recipient / Account</span>
            <span className="font-semibold text-gray-900">
              {transferData.destinationType === "own"
                ? accounts.find((a) => a.id === transferData.destinationAccountId)?.name || "Own Connected Account"
                : transferData.destinationType === "external_bank"
                  ? `${transferData.recipientName || "External Recipient"} (${transferData.bankName || "US Bank"} ••••${transferData.accountNumber?.slice(-4) || "0000"})`
                  : transferData.destinationEmail}
            </span>
          </div>

          <div className="flex justify-between text-14 border-t pt-3">
            <span className="text-gray-500">Transfer Speed</span>
            <span className="font-semibold text-gray-900">
              {isSameDay ? "Same-Day ACH (Arrives Today)" : "Standard ACH (1-2 Business Days)"}
            </span>
          </div>

          <div className="flex justify-between text-14 border-t pt-3">
            <span className="text-gray-500">Transfer Fee</span>
            <span className="font-medium text-emerald-600">
              {isSameDay ? "$1.00" : "$0.00 (Free)"}
            </span>
          </div>

          <div className="flex justify-between border-t pt-4 text-16">
            <span className="font-bold text-gray-900">Total Debit</span>
            <span className="font-bold text-blue-600">
              {formatAmount(totalAmount)}
            </span>
          </div>

          {transferData.description && (
            <div className="flex justify-between border-t pt-3 text-14">
              <span className="text-gray-500">Memo / Reference</span>
              <span className="text-gray-800">{transferData.description}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-3.5 border border-blue-100 text-12 text-blue-800">
          <ShieldCheck size={18} className="text-blue-600 shrink-0" />
          <span>
            Protected by Dwolla ACH Network security. ACH transactions settle through NACHA standards.
          </span>
        </div>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => setStep("form")}
            className="flex-1 py-3 border-gray-300"
            disabled={isLoading}
          >
            Back
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md py-3 font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Processing ACH...
              </>
            ) : (
              "Confirm & Authorize ACH"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Payment Method Tabs */}
      <div className="flex rounded-xl border border-white/20 p-1 bg-white/50 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => setPaymentMethod("ach")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2.5 text-14 font-medium transition-all ${
            paymentMethod === "ach"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Building2 size={16} />
          Bank Transfer (ACH)
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod("razorpay")}
          className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2.5 text-14 font-medium transition-all ${
            paymentMethod === "razorpay"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Smartphone size={16} />
          Razorpay / UPI
        </button>
      </div>

      {/* ACH Transfer Form */}
      {paymentMethod === "ach" && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
                {error}
              </div>
            )}

            {/* Direction Switcher */}
            <FormField
              control={form.control}
              name="direction"
              render={({ field }) => (
                <div className="flex rounded-xl bg-gray-100 p-1 border border-gray-200">
                  <button
                    type="button"
                    onClick={() => field.onChange("send")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-14 font-semibold transition-all ${
                      field.value === "send"
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <ArrowUpRight size={16} />
                    Send ACH Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange("receive")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-14 font-semibold transition-all ${
                      field.value === "receive"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    <ArrowDownLeft size={16} />
                    Request ACH Debit
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
                      className="input-class w-full rounded-xl border border-gray-300 p-3 bg-white text-14"
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
              <p className="text-13 text-gray-500 font-medium">
                Available Balance:{" "}
                <span className="text-gray-900 font-semibold">
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
                  <FormLabel className="form-label">Transfer Recipient Type</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => field.onChange("own")}
                        className={`py-2.5 px-3 rounded-xl border text-13 font-medium transition-all ${
                          field.value === "own"
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        My Account
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange("external_bank")}
                        className={`py-2.5 px-3 rounded-xl border text-13 font-medium transition-all ${
                          field.value === "external_bank"
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        External US Bank
                      </button>
                      <button
                        type="button"
                        onClick={() => field.onChange("email")}
                        className={`py-2.5 px-3 rounded-xl border text-13 font-medium transition-all ${
                          field.value === "email"
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
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
                        className="input-class w-full rounded-xl border border-gray-300 p-3 bg-white text-14"
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
              <div className="space-y-4 p-5 rounded-2xl bg-blue-50/40 border border-blue-100">
                <p className="text-14 font-semibold text-gray-900 flex items-center gap-2">
                  <Building2 size={16} className="text-blue-600" />
                  External US Bank Routing & Account Details
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="recipientName"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">Recipient Full Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. John Doe" className="input-class bg-white" />
                        </FormControl>
                      </div>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">Bank Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g. Chase, Bank of America" className="input-class bg-white" />
                        </FormControl>
                      </div>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="routingNumber"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">9-Digit Routing Number (ABA)</FormLabel>
                        <FormControl>
                          <Input {...field} maxLength={9} placeholder="122000218" className="input-class bg-white font-mono" />
                        </FormControl>
                      </div>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="accountNumber"
                    render={({ field }) => (
                      <div className="form-item">
                        <FormLabel className="form-label text-13">Account Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="883920194" className="input-class bg-white font-mono" />
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
                        className="input-class bg-white"
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
                  <FormLabel className="form-label">ACH Speed & Fee</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => field.onChange("standard")}
                        className={`p-3.5 rounded-xl border flex flex-col gap-1 transition-all ${
                          field.value === "standard"
                            ? "border-blue-500 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-500/20"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        <span className="text-14 font-bold flex items-center gap-1.5">
                          <Clock size={16} className="text-blue-600" /> Standard ACH
                        </span>
                        <span className="text-12 text-emerald-600 font-medium">$0.00 Fee • 1–2 Business Days</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => field.onChange("sameday")}
                        className={`p-3.5 rounded-xl border flex flex-col gap-1 transition-all ${
                          field.value === "sameday"
                            ? "border-blue-500 bg-blue-50/80 text-blue-900 font-semibold ring-2 ring-blue-500/20"
                            : "border-gray-200 bg-white text-gray-700"
                        }`}
                      >
                        <span className="text-14 font-bold flex items-center gap-1.5">
                          <Clock size={16} className="text-purple-600" /> Same-Day ACH
                        </span>
                        <span className="text-12 text-purple-700 font-medium">$1.00 Fee • Arrives Today (5 PM EST)</span>
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

            <Button type="submit" className="form-btn bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white w-full shadow-md">
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
