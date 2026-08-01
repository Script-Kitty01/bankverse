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

const PlaidLinkButton = () => {
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
      className="flex items-center gap-2 bg-bankGradient text-white"
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

export default PlaidLinkButton;
