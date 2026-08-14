import HeaderBox from "@/components/HeaderBox";
import RecentTransactions from "@/components/RecentTransactions";
import RightSidebar from "@/components/RightSidebar";
import TotalBalanceBox from "@/components/TotalBalanceBox";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { getAccounts } from "@/lib/actions/plaid.actions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "View your financial overview, recent transactions, and account balances.",
};

const Home = async () => {
  const loggedIn = await getCurrentUser();

  if (!loggedIn) {
    redirect("/sign-in");
  }

  // Fetch accounts with balances
  const accountsResult = await getAccounts();
  const accounts = accountsResult.success
    ? (accountsResult.accounts ?? [])
    : [];

  const totalCurrentBalance = accounts.reduce(
    (sum, a) => sum + a.currentBalance,
    0,
  );
  const totalBanks = accounts.length;

  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header">
          <HeaderBox
            type="greeting"
            title="Welcome"
            user={loggedIn?.firstName || "Guest"}
            subtext="Access and manage your account and transactions efficiently."
          />

          <TotalBalanceBox
            accounts={accounts}
            totalBanks={totalBanks}
            totalCurrentBalance={totalCurrentBalance || 0}
          />
        </header>
        <RecentTransactions />
      </div>
      <RightSidebar user={loggedIn} transactions={[]} banks={accounts} />
    </section>
  );
};

export default Home;
