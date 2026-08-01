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
} from "lucide-react";
import { useRouter } from "next/navigation";
import RazorpayCheckout from "@/components/RazorpayCheckout";

const transferSchema = z.object({
  sourceAccountId: z.string().min(1, "Select a source account"),
  destinationType: z.enum(["own", "external"]),
  destinationAccountId: z.string().optional(),
  destinationEmail: z.string().email().optional(),
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
      sourceAccountId: "",
      destinationType: "own",
      destinationAccountId: "",
      destinationEmail: "",
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
      <div className="flex flex-col items-center justify-center gap-6 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle size={32} className="text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-24 font-semibold text-gray-900">
            Transfer Initiated!
          </h2>
          <p className="text-16 text-gray-600 mt-2">
            Your transfer of {formatAmount(Number(transferData?.amount || 0))}{" "}
            has been initiated.
          </p>
        </div>
        <Button onClick={() => router.push("/")} className="bg-bankGradient">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (step === "confirm" && transferData) {
    const sourceAcct = accounts.find(
      (a) => a.id === transferData.sourceAccountId,
    );
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-20 font-semibold text-gray-900">
          Confirm Transfer
        </h2>
        <div className="rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex justify-between">
            <span className="text-14 text-gray-500">From</span>
            <span className="text-14 font-semibold">
              {sourceAcct?.name} (...{sourceAcct?.mask})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-14 text-gray-500">To</span>
            <span className="text-14 font-semibold">
              {transferData.destinationType === "own"
                ? accounts.find(
                    (a) => a.id === transferData.destinationAccountId,
                  )?.name || "Own Account"
                : transferData.destinationEmail}
            </span>
          </div>
          <div className="flex justify-between border-t pt-4">
            <span className="text-16 font-semibold">Amount</span>
            <span className="text-16 font-bold text-green-600">
              {formatAmount(Number(transferData.amount))}
            </span>
          </div>
          {transferData.description && (
            <div className="flex justify-between border-t pt-4">
              <span className="text-14 text-gray-500">Note</span>
              <span className="text-14">{transferData.description}</span>
            </div>
          )}
        </div>
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => setStep("form")}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1 bg-bankGradient"
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              "Confirm Transfer"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Payment Method Tabs */}
      <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50">
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

            {/* Source Account */}
            <FormField
              control={form.control}
              name="sourceAccountId"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">From Account</FormLabel>
                  <FormControl>
                    <select
                      {...field}
                      className="input-class w-full rounded-lg border border-gray-300 p-3"
                    >
                      <option value="">Select account</option>
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
              <p className="text-14 text-gray-500">
                Available balance:{" "}
                {formatAmount(selectedAccount.availableBalance)}
              </p>
            )}

            {/* Destination Type */}
            <FormField
              control={form.control}
              name="destinationType"
              render={({ field }) => (
                <div className="form-item">
                  <FormLabel className="form-label">Transfer To</FormLabel>
                  <FormControl>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          {...field}
                          value="own"
                          checked={field.value === "own"}
                          onChange={() => field.onChange("own")}
                        />
                        <span className="text-14">My Account</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          {...field}
                          value="external"
                          checked={field.value === "external"}
                          onChange={() => field.onChange("external")}
                        />
                        <span className="text-14">External Account</span>
                      </label>
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
                        className="input-class w-full rounded-lg border border-gray-300 p-3"
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

            {/* Destination Email (external) */}
            {form.watch("destinationType") === "external" && (
              <FormField
                control={form.control}
                name="destinationEmail"
                render={({ field }) => (
                  <div className="form-item">
                    <FormLabel className="form-label">
                      Recipient Email
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter recipient email"
                        className="input-class"
                      />
                    </FormControl>
                    <FormMessage className="mt-2 form-message" />
                  </div>
                )}
              />
            )}

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

            <Button type="submit" className="form-btn bg-bankGradient w-full">
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
