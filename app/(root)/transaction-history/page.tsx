import HeaderBox from "@/components/HeaderBox";
import TransactionsTable from "@/components/TransactionsTable";
import TransactionPagination from "@/components/TransactionPagination";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { getAccounts } from "@/lib/actions/plaid.actions";
import { getTransactionsByUserId } from "@/lib/supabase/db";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { formatAmount } from "@/lib/utils";
import { Building2, CreditCard, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transaction History",
  description:
    "View and search your complete transaction history across all accounts.",
};

interface Props {
  searchParams: Promise<{ page?: string; id?: string }>;
}

const TransactionHistory = async ({ searchParams }: Props) => {
  const loggedIn = await getCurrentUser();
  if (!loggedIn) redirect("/sign-in");

  const { page, id } = await searchParams;
  const currentPage = Number(page) || 1;
  const limit = 10;
  const offset = (currentPage - 1) * limit;

  // Get user's accounts
  const accountsResult = await getAccounts();
  const accounts = accountsResult.success
    ? (accountsResult.accounts ?? [])
    : [];

  // Identify selected account if 'id' parameter is provided
  const selectedAccount = accounts.find(
    (a) => a.id === id || a.appwriteItemId === id || a.sharableId === id,
  );

  const accountIds = selectedAccount
    ? ([selectedAccount.id, selectedAccount.appwriteItemId].filter(Boolean) as string[])
    : accounts.flatMap((a) => [a.id, a.appwriteItemId]).filter(Boolean) as string[];

  // Get transactions for selected account(s)
  const txResult = await getTransactionsByUserId(accountIds, limit, offset);
  const transactions = txResult.documents as unknown as Transaction[];
  const totalPages = Math.ceil(txResult.total / limit);

  return (
    <section className="transactions">
      <div className="transactions-header">
        <HeaderBox
          title={selectedAccount ? selectedAccount.name : "Transaction History"}
          subtext={
            selectedAccount
              ? `Showing transactions for ${selectedAccount.name} (...${selectedAccount.mask})`
              : "View all transactions across your connected bank accounts."
          }
        />
      </div>

      {/* Bank Account Selection Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <Link
          href="/transaction-history"
          className={`px-4 py-2 rounded-xl text-14 font-semibold transition-all ${
            !id
              ? "bg-blue-600 text-white shadow-md"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          All Accounts ({accounts.length})
        </Link>

        {accounts.map((account) => {
          const isSelected =
            id === account.id || id === account.appwriteItemId;
          return (
            <Link
              key={account.id}
              href={`/transaction-history?id=${account.id}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-14 font-medium transition-all ${
                isSelected
                  ? "bg-blue-600 text-white shadow-md font-semibold"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Building2 size={16} />
              <span>{account.name}</span>
              <span
                className={`text-12 font-mono px-1.5 py-0.5 rounded ${
                  isSelected ? "bg-white/20 text-white" : "bg-gray-200 text-gray-700"
                }`}
              >
                ...{account.mask}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Selected Account Summary Banner */}
      {selectedAccount && (
        <div className="glass-card rounded-2xl p-6 border border-blue-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <CreditCard size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-18 font-bold text-gray-900">
                  {selectedAccount.name}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-11 font-mono font-semibold bg-blue-100 text-blue-800">
                  •••• {selectedAccount.mask}
                </span>
              </div>
              <p className="text-13 text-gray-500 font-medium capitalize">
                {selectedAccount.type} • {selectedAccount.subtype || "Account"}
              </p>
            </div>
          </div>

          <div className="flex gap-6 border-l md:border-gray-200 md:pl-6">
            <div>
              <p className="text-12 text-gray-500 font-medium">Current Balance</p>
              <p className="text-20 font-bold text-gray-900">
                {formatAmount(selectedAccount.currentBalance)}
              </p>
            </div>
            <div>
              <p className="text-12 text-gray-500 font-medium">Available Balance</p>
              <p className="text-20 font-bold text-emerald-600">
                {formatAmount(selectedAccount.availableBalance)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {transactions.length > 0 ? (
          <>
            <TransactionsTable transactions={transactions} />
            <TransactionPagination
              currentPage={currentPage}
              totalPages={totalPages}
            />
          </>
        ) : (
          <div className="glass-card rounded-2xl p-8 text-center text-gray-500 space-y-2">
            <Wallet size={36} className="mx-auto text-gray-400" />
            <p className="text-16 font-semibold text-gray-700">
              No transactions found
            </p>
            <p className="text-14 text-gray-500">
              There are no transactions recorded for {selectedAccount ? selectedAccount.name : "this view"}.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default TransactionHistory;
