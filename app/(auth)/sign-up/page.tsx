import AuthForm from "@/components/AuthForm";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up",
  description:
    "Create your BankVerse account and start managing your finances today.",
};

const SignUp = () => {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    redirect("/");
  }

  return (
    <section className="flex-center size-full max-sm:px-6">
      <AuthForm type="sign-up" />
    </section>
  );
};

export default SignUp;
