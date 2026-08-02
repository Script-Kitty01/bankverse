"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, PlaidLinkOnSuccess } from "react-plaid-link";
import { Button } from "@/components/ui/button";
import {
  createLinkToken,
  exchangePublicToken,
} from "@/lib/actions/plaid.actions";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

const PlaidLinkButtonInner = () => {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchLinkToken = async () => {
      setIsLoading(true);
      try {
        const result = await createLinkToken();
        if (result.success && result.linkToken) {
          setLinkToken(result.linkToken);
        }
      } catch {
        // Silently fail — user can retry
      } finally {
        setIsLoading(false);
      }
    };

    fetchLinkToken();
  }, []);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken) => {
      if (!publicToken) return;
      await exchangePublicToken(publicToken);
      router.refresh();
    },
    [router],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess,
  });

  return (
    <Button
      onClick={() => open()}
      disabled={!ready || isLoading}
      className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md"
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Plus size={16} />
      )}
      Connect New Bank
    </Button>
  );
};

const PlaidLinkButton = () => {
  const plaidEnabled = process.env.NEXT_PUBLIC_PLAID_ENABLED !== "false";

  if (!plaidEnabled) return null;

  return <PlaidLinkButtonInner />;
};

export default PlaidLinkButton;
