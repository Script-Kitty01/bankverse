import HeaderBox from "@/components/HeaderBox";
import ProfileForm from "@/components/ProfileForm";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile",
  description:
    "Manage your personal information, change your password, and update your settings.",
};

const Profile = async () => {
  const loggedIn = await getCurrentUser();
  if (!loggedIn) redirect("/sign-in");

  return (
    <section className="home">
      <div className="home-content">
        <HeaderBox
          title="Profile & Settings"
          subtext="Manage your personal information and account settings."
        />
        <ProfileForm user={loggedIn} />
      </div>
    </section>
  );
};

export default Profile;
