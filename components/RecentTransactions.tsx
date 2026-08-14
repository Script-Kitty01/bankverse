import Link from "next/link";
import { getAccounts } from "@/lib/actions/plaid.actions";
import { getTransactionsByUserId } from "@/lib/appwrite/db";
import TransactionsTable from "./TransactionsTable";
import { Building2 } from "lucide-react";

const RecentTransactions = async () => {
  const accountsResult = await getAccounts();
  const accounts = accountsResult.success
    ? (accountsResult.accounts ?? [])
    : [];
  // Use both appwriteItemId and id for matching mock data
  const accountIds = accounts.flatMap((a) => [a.appwriteItemId, a.id]);

  const { documents: transactions } = await getTransactionsByUserId(
    accountIds,
    10,
    0,
  );

  return (
    <section className="recent-transactions space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="recent-transactions-label">Recent Transactions</h2>
        <Link href="/transaction-history" className="view-all-btn">
          View All
        </Link>
      </header>

      {/* Account Quick Filter Tabs */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
          <Link
            href="/transaction-history"
            className="px-3 py-1.5 rounded-lg text-13 font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all flex items-center gap-1.5"
          >
            All Banks ({accounts.length})
          </Link>
          {accounts.map((account) => (
            <Link
              key={account.id}
              href={`/transaction-history?id=${account.id}`}
              className="px-3 py-1.5 rounded-lg text-13 font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all flex items-center gap-1.5"
            >
              <Building2 size={14} className="text-gray-500" />
              <span>{account.name}</span>
              <span className="text-11 text-gray-500 font-mono">
                ...{account.mask}
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {transactions.length > 0 ? (
          <TransactionsTable transactions={transactions as Transaction[]} />
        ) : (
          <p className="text-14 text-gray-500">
            Connect a bank account to see your recent transactions.
          </p>
        )}
      </div>
    </section>
  );
};

export default RecentTransactions;
