import MobileNav from "@/components/MobileNav";
import Sidebar from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/actions/user.actions";
import { redirect } from "next/navigation";

import Image from "next/image";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const loggedIn = await getCurrentUser();

  if (!loggedIn) {
    redirect("/sign-in");
  }

  return (
    <main className="flex h-screen w-full font-inter bg-slate-950">
      <Sidebar user={loggedIn} />

      <div className="flex size-full flex-col">
        <div className="root-layout">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md shadow-blue-900/20">
            <Image
              src="/icons/logo.svg"
              width={18}
              height={18}
              alt="BankVerse"
              className="brightness-0 invert"
            />
          </div>
          <div>
            <MobileNav user={loggedIn} />
          </div>
        </div>
        <div className="animate-fade-in">{children}</div>
      </div>
    </main>
  );
}
