import HeaderBox from "@/components/HeaderBox";
import TransferForm from "@/components/TransferForm";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { getAccounts } from "@/lib/actions/plaid.actions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Transfer",
  description:
    "Transfer funds between your accounts or send money to external bank accounts.",
};

const PaymentTransfer = async () => {
  const loggedIn = await getCurrentUser();
  if (!loggedIn) redirect("/sign-in");

  const accountsResult = await getAccounts();
  const accounts = accountsResult.success
    ? (accountsResult.accounts ?? [])
    : [];

  return (
    <section className="payment-transfer">
      <HeaderBox
        title="Payment Transfer"
        subtext="Transfer funds between your accounts or to external accounts."
      />

      <section className="size-full pt-5">
        <TransferForm accounts={accounts} />
      </section>
    </section>
  );
};

export default PaymentTransfer;
