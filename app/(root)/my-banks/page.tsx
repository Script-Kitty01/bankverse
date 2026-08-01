import BankCard from "@/components/BankCard";
import HeaderBox from "@/components/HeaderBox";
import PlaidLinkButton from "@/components/PlaidLinkButton";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { getAccounts } from "@/lib/actions/plaid.actions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Banks",
  description: "View and manage all your connected bank accounts in one place.",
};

const MyBanks = async () => {
  const loggedIn = await getCurrentUser();
  if (!loggedIn) redirect("/sign-in");

  const accountsResult = await getAccounts();
  const accounts = accountsResult.success
    ? (accountsResult.accounts ?? [])
    : [];

  return (
    <section className="my-banks">
      <HeaderBox
        title="My Bank Accounts"
        subtext="Manage your connected bank accounts."
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="header-2">Your Accounts</h2>
          <PlaidLinkButton />
        </div>

        {accounts.length > 0 ? (
          <div className="flex flex-wrap gap-6">
            {accounts.map((account) => (
              <BankCard
                key={account.id}
                account={account}
                userName={`${loggedIn.firstName} ${loggedIn.lastName}`}
                showBalance={true}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-gray-300 p-12">
            <p className="text-16 text-gray-500">
              No bank accounts connected yet.
            </p>
            <PlaidLinkButton />
          </div>
        )}
      </div>
    </section>
  );
};

export default MyBanks;
