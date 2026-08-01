import HeaderBox from "@/components/HeaderBox";
import TransactionsTable from "@/components/TransactionsTable";
import TransactionPagination from "@/components/TransactionPagination";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { getAccounts } from "@/lib/actions/plaid.actions";
import { getTransactionsByUserId } from "@/lib/appwrite/db";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transaction History",
  description:
    "View and search your complete transaction history across all accounts.",
};

interface Props {
  searchParams: Promise<{ page?: string }>;
}

const TransactionHistory = async ({ searchParams }: Props) => {
  const loggedIn = await getCurrentUser();
  if (!loggedIn) redirect("/sign-in");

  const { page } = await searchParams;
  const currentPage = Number(page) || 1;
  const limit = 10;
  const offset = (currentPage - 1) * limit;

  // Get user's accounts
  const accountsResult = await getAccounts();
  const accounts = accountsResult.success
    ? (accountsResult.accounts ?? [])
    : [];
  const accountIds = accounts.map((a) => a.id);

  // Get transactions
  const txResult = await getTransactionsByUserId(accountIds, limit, offset);
  const transactions = txResult.documents as unknown as Transaction[];
  const totalPages = Math.ceil(txResult.total / limit);

  return (
    <section className="transactions">
      <div className="transactions-header">
        <HeaderBox
          title="Transaction History"
          subtext="View all your transactions across all accounts."
        />
      </div>

      <div className="space-y-6">
        <TransactionsTable transactions={transactions} />
        <TransactionPagination
          currentPage={currentPage}
          totalPages={totalPages}
        />
      </div>
    </section>
  );
};

export default TransactionHistory;
