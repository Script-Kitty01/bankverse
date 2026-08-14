"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCustomBank } from "@/lib/actions/plaid.actions";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle,
  Loader2,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { formatAmount } from "@/lib/utils";

const POPULAR_INSTITUTIONS = [
  { name: "Chase", code: "CHASE", color: "bg-blue-900 text-white" },
  { name: "Bank of America", code: "BOA", color: "bg-red-700 text-white" },
  { name: "Wells Fargo", code: "WF", color: "bg-amber-700 text-white" },
  { name: "Citibank", code: "CITI", color: "bg-sky-700 text-white" },
  { name: "Capital One", code: "CAP1", color: "bg-indigo-900 text-white" },
  { name: "U.S. Bank", code: "USB", color: "bg-blue-700 text-white" },
  { name: "Fidelity", code: "FID", color: "bg-emerald-800 text-white" },
  { name: "Charles Schwab", code: "SCHW", color: "bg-cyan-800 text-white" },
  { name: "PNC Bank", code: "PNC", color: "bg-orange-600 text-white" },
  { name: "TD Bank", code: "TD", color: "bg-green-700 text-white" },
];

interface AddBankModalProps {
  buttonText?: string;
  className?: string;
  children?: React.ReactNode;
}

const AddBankModal = ({
  buttonText = "Connect New Bank",
  className = "",
  children,
}: AddBankModalProps) => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"select" | "details" | "connecting" | "success">("select");
  const [selectedBankName, setSelectedBankName] = useState("");
  const [customBankName, setCustomBankName] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings" | "credit" | "investment">("checking");
  const [initialBalance, setInitialBalance] = useState("5000");
  const [accountMask, setAccountMask] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAccount, setCreatedAccount] = useState<Account | null>(null);

  const bankName = selectedBankName || customBankName || "National Bank";

  const handleSelectBank = (name: string) => {
    setSelectedBankName(name);
    setCustomBankName("");
    setStep("details");
  };

  const handleAddBankSubmit = async () => {
    if (!bankName.trim()) {
      setError("Please enter or select a bank name.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setStep("connecting");

    setTimeout(async () => {
      try {
        const numBalance = Number(initialBalance) || 5000;
        const result = await addCustomBank({
          bankName,
          accountType,
          balance: numBalance,
          mask: accountMask || Math.floor(1000 + Math.random() * 9000).toString(),
        });

        if (result.success && result.account) {
          setCreatedAccount(result.account);
          setStep("success");
          router.refresh();
        } else {
          setError(result.error || "Failed to link bank account.");
          setStep("details");
        }
      } catch {
        setError("Failed to link bank account. Please try again.");
        setStep("details");
      } finally {
        setIsLoading(false);
      }
    }, 1200);
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep("select");
    setSelectedBankName("");
    setCustomBankName("");
    setError(null);
    setCreatedAccount(null);
  };
  return (
    <>
      {children ? (
        <div
          onClick={() => setIsOpen(true)}
          className={`cursor-pointer inline-flex items-center ${className}`}
        >
          {children}
        </div>
      ) : (
        <Button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md font-semibold px-4 py-2.5 rounded-xl ${className}`}
        >
          <Plus size={18} />
          {buttonText}
        </Button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 md:p-8 shadow-2xl border border-gray-100 space-y-6">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Building2 size={22} />
                </div>
                <div>
                  <h2 className="text-18 font-bold text-gray-900">
                    Connect Bank Account
                  </h2>
                  <p className="text-12 text-gray-500">
                    Secure 256-bit Direct Bank Authorization
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-13 text-red-600 border border-red-200">
                {error}
              </div>
            )}

            {/* STEP 1: Select Bank Institution */}
            {step === "select" && (
              <div className="space-y-4">
                <Label className="form-label text-14">
                  Select your financial institution
                </Label>

                <div className="grid grid-cols-2 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                  {POPULAR_INSTITUTIONS.map((inst) => (
                    <button
                      key={inst.name}
                      type="button"
                      onClick={() => handleSelectBank(inst.name)}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left group"
                    >
                      <span className={`px-2 py-1 rounded text-10 font-bold font-mono ${inst.color}`}>
                        {inst.code}
                      </span>
                      <span className="text-13 font-semibold text-gray-800 group-hover:text-blue-700">
                        {inst.name}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="form-item pt-2 border-t">
                  <Label className="form-label text-13">
                    Or Search / Enter Custom Bank Name
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. Ally Bank, SVB, HSBC"
                      value={customBankName}
                      onChange={(e) => {
                        setCustomBankName(e.target.value);
                        setSelectedBankName("");
                      }}
                      className="input-class"
                    />
                    <Button
                      onClick={() => {
                        if (customBankName.trim()) setStep("details");
                      }}
                      disabled={!customBankName.trim()}
                      className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {/* STEP 2: Configure Account Details */}
            {step === "details" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <span className="text-13 text-blue-900 font-semibold flex items-center gap-2">
                    <Building2 size={16} className="text-blue-600" /> {bankName}
                  </span>
                  <button
                    onClick={() => setStep("select")}
                    className="text-12 text-blue-600 underline font-medium"
                  >
                    Change Bank
                  </button>
                </div>

                <div className="form-item">
                  <Label className="form-label text-13">Account Type</Label>

                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {(["checking", "savings", "credit", "investment"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setAccountType(type)}
                        className={`p-2.5 rounded-xl border text-13 font-medium capitalize transition-all ${
                          accountType === type
                            ? "border-blue-500 bg-blue-50 text-blue-700 font-semibold"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="form-item">
                    <Label className="form-label text-13">Starting Balance ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="5000.00"
                      value={initialBalance}
                      onChange={(e) => setInitialBalance(e.target.value)}
                      className="input-class font-semibold"
                    />
                  </div>

                  <div className="form-item">
                    <Label className="form-label text-13">Last 4 Digits</Label>
                    <Input
                      maxLength={4}
                      placeholder="e.g. 8912"
                      value={accountMask}
                      onChange={(e) => setAccountMask(e.target.value.replace(/\D/g, ""))}
                      className="input-class font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-gray-50 p-3 border text-12 text-gray-600">
                  <ShieldCheck size={18} className="text-blue-600 shrink-0" />
                  <span>
                    BankVerse uses end-to-end encryption to securely authenticate your financial institution.
                  </span>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep("select")}
                    className="flex-1 py-3"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleAddBankSubmit}
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 shadow-md"
                  >
                    Connect {bankName}
                  </Button>
                </div>
              </div>
            )}
            {/* STEP 3: Connecting Animation */}
            {step === "connecting" && (
              <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <Loader2 size={32} className="animate-spin text-blue-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-16 font-bold text-gray-900">
                    Connecting to {bankName}...
                  </h3>
                  <p className="text-13 text-gray-500">
                    Verifying credentials & fetching balance securely
                  </p>
                </div>
              </div>
            )}

            {/* STEP 4: Success Screen */}
            {step === "success" && createdAccount && (
              <div className="flex flex-col items-center gap-5 text-center py-2">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-md">
                  <CheckCircle size={36} />
                </div>

                <div className="space-y-1">
                  <h3 className="text-20 font-bold text-gray-900">
                    Bank Account Linked!
                  </h3>
                  <p className="text-14 text-gray-600">
                    {createdAccount.name} has been connected to BankVerse.
                  </p>
                </div>

                <div className="w-full rounded-xl bg-gray-50 p-4 border text-left text-13 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Account Name</span>
                    <span className="font-semibold text-gray-900">{createdAccount.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Account Number</span>
                    <span className="font-mono text-gray-900">•••• {createdAccount.mask}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Available Balance</span>
                    <span className="font-bold text-emerald-600">
                      {formatAmount(createdAccount.availableBalance)}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={handleClose}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 text-white font-semibold py-3 shadow-md"
                >
                  Done
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AddBankModal;