import Link from "next/link";
import { getAccounts } from "@/lib/actions/plaid.actions";
import { getTransactionsByUserId } from "@/lib/appwrite/db";
import TransactionsTable from "./TransactionsTable";

const RecentTransactions = async () => {
  const accountsResult = await getAccounts();
  const accounts = accountsResult.success ? accountsResult.accounts ?? [] : [];
  // Use both appwriteItemId and id for matching mock data
  const accountIds = accounts.flatMap((a) => [a.appwriteItemId, a.id]);

  const { documents: transactions } = await getTransactionsByUserId(accountIds, 5, 0);

  return (
    <section className="recent-transactions">
      <header className="flex items-center justify-between">
        <h2 className="recent-transactions-label">Recent Transactions</h2>
        <Link href="/transaction-history" className="view-all-btn">
          View All
        </Link>
      </header>
      <div className="flex flex-col gap-4 mt-4">
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
