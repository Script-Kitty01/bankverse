import HeaderBox from "@/components/HeaderBox";
import ChaosLab from "@/components/ChaosLab";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chaos Lab",
  description:
    "Test system resilience against payment failure scenarios with chaos engineering.",
};

const ChaosLabPage = async () => {
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
            title="Chaos Lab"
            subtext="Inject failures and verify the system handles them correctly."
          />
        </header>
        <ChaosLab />
      </div>
    </section>
  );
};

export default ChaosLabPage;
