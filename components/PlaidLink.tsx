"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, PlaidLinkOnSuccess } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import {
  createLinkToken,
  exchangePublicToken,
} from "@/lib/actions/plaid.actions";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const PlaidLink = ({ user }: { user: { success: boolean } }) => {
  void user;
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const result = await createLinkToken();
        if (result.success && result.linkToken) {
          setLinkToken(result.linkToken);
        } else if ("error" in result) {
          setError(result.error ?? "Failed to initialize bank linking.");
        }
      } catch {
        setError("Failed to initialize bank linking.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLinkToken();
  }, []);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken) => {
      if (!publicToken) return;
      const result = await exchangePublicToken(publicToken);
      if (result.success) {
        router.push("/");
      }
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-14 text-gray-600">
          Preparing bank connection...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 border border-red-200">
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-14 text-gray-600">
        Connect your bank account to get started with BankVerse. We use Plaid to
        securely link your accounts.
      </p>
      <Button
        onClick={() => open()}
        disabled={!ready}
        className="form-btn bg-bankGradient"
      >
        Connect Bank Account
      </Button>
    </div>
  );
};

export default PlaidLink;
