import HeaderBox from "@/components/HeaderBox";
import LogIngestorViewer from "@/components/LogIngestorViewer";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Transaction Logs | BankVerse",
  description:
    "Ingest transaction logs, classify across 9 fault categories, and manage auto-solve policies.",
};

const TransactionLogsPage = async () => {
  const loggedIn = await getCurrentUser();

  if (!loggedIn) {
    redirect("/sign-in");
  }

  return (
    <section className="home">
      <div className="home-content">
        <header className="home-header mb-6">
          <HeaderBox
            type="title"
            title="Transaction Logs"
            subtext="Bulk log ingestion pipeline with 9-category fault classification and auto-solve policies."
          />
        </header>
        <LogIngestorViewer />
      </div>
    </section>
  );
};

export default TransactionLogsPage;
