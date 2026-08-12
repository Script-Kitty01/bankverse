import HeaderBox from "@/components/HeaderBox";
import OperationsDashboard from "@/components/OperationsDashboard";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Operations Dashboard",
  description:
    "Monitor payment operations, incidents, provider health, and reconciliation status.",
};

const OperationsPage = async () => {
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
            title="Operations"
            subtext="Monitor payment health, incidents, and reconciliation status."
          />
        </header>
        <OperationsDashboard />
      </div>
    </section>
  );
};

export default OperationsPage;
