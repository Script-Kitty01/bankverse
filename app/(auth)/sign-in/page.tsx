import AuthForm from "@/components/AuthForm";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your BankVerse account to manage your finances.",
};

const SignIn = () => {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirect("/");
  }

  return (
    <section className="flex-center size-full max-sm:px-6">
      <AuthForm type="sign-in" />
    </section>
  );
};

export default SignIn;
