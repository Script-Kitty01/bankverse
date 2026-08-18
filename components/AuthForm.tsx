"use client";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import Image from "next/image";
import Link from "next/link";
import React, { useState } from "react";
import CustomInput from "./CustomInput";
import { authformSchema } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/actions/user.actions";
import PlaidLink from "./PlaidLink";

const AuthForm = ({ type }: AuthFormProps) => {
  const router = useRouter();
  const [user, setUser] = useState<{ success: boolean } | null | undefined>(
    null,
  );
  const [isLoading, setisLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formSchema = authformSchema(type);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // 2. Define a submit handler.
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    setisLoading(true);
    setErrorMessage(null);

    try {
      // Sign up with Supabase and handle Plaid link
      if (type === "sign-up") {
        const newUser = await signUp(data as SignUpParams);
        if (newUser && newUser.success) {
          setUser(newUser);
        } else if (newUser && "error" in newUser) {
          setErrorMessage(newUser.error);
        }
      }

      if (type === "sign-in") {
        const response = await signIn({
          email: data.email,
          password: data.password,
        });
        if (response && response.success) {
          router.push("/");
        } else if (response && "error" in response) {
          setErrorMessage(response.error ?? "An unexpected error occurred.");
        }
      }
    } catch (error) {
      console.error("AuthForm error:", error);
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setisLoading(false);
    }
  };

  return (
    <section className="auth-form">
      <div className="glass-card rounded-2xl p-8 md:p-10">
        <header className="flex flex-col gap-5 md:gap-8">
          <Link href="/" className="cursor-pointer flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-900/30">
              <Image
                src="/icons/logo.svg"
                width={22}
                height={22}
                alt="BankVerse"
                className="brightness-0 invert"
              />
            </div>
            <h1 className="text-26 font-ibm-plex-serif font-bold text-slate-50 tracking-tight">
              BankVerse
            </h1>
          </Link>
          <div className="flex flex-col gap-1 md:gap-3">
            <div>
              <h1 className="text-24 lg:text-36 font-bold text-slate-50 tracking-tight">
                {user
                  ? "Link account"
                  : type === "sign-in"
                    ? "Sign In"
                    : "Sign Up"}
              </h1>
              <p className="text-16 font-normal text-slate-400">
                {user
                  ? "Link your account to get started"
                  : "Please enter your details"}
              </p>
            </div>
          </div>
        </header>

        {user ? (
          <div className="flex flex-col gap-4">
            <PlaidLink user={user} />
          </div>
        ) : (
          <>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                {type === "sign-up" && (
                  <>
                    <div className="flex gap-4">
                      <CustomInput
                        control={form.control}
                        name="firstName"
                        label="First Name"
                        placeholder="Enter your first name"
                      />
                      <CustomInput
                        control={form.control}
                        name="lastName"
                        label="Last Name"
                        placeholder="Enter your last name"
                      />
                    </div>
                    <CustomInput
                      control={form.control}
                      name="address1"
                      label="Address"
                      placeholder="Enter your specific address"
                    />
                    <CustomInput
                      control={form.control}
                      name="city"
                      label="City"
                      placeholder="Enter your city"
                    />
                    <div className="flex gap-4">
                      <CustomInput
                        control={form.control}
                        name="state"
                        label="State (e.g. MH, DL, KA)"
                        placeholder="Example: MH"
                      />
                      <CustomInput
                        control={form.control}
                        name="postalCode"
                        label="PIN Code"
                        placeholder="Example: 400001"
                      />
                    </div>
                    <div className="flex gap-4">
                      <CustomInput
                        control={form.control}
                        name="dateOfBirth"
                        label="Date of Birth"
                        placeholder="YYYY-MM-DD"
                      />
                      <CustomInput
                        control={form.control}
                        name="pan"
                        label="PAN"
                        placeholder="Example: ABCP1234X"
                      />
                    </div>
                  </>
                )}

                <CustomInput
                  control={form.control}
                  name="email"
                  label="Email"
                  placeholder="Enter your email"
                />

                <CustomInput
                  control={form.control}
                  name="password"
                  label="Password"
                  placeholder="Enter your password"
                />

                {errorMessage && (
                  <div className="rounded-xl bg-red-900/20 p-4 text-14 text-red-400 border border-red-800/50 flex items-center gap-2">
                    <span className="text-red-400 text-lg leading-none">⚠</span>
                    {errorMessage}
                  </div>
                )}
                <div className="flex flex-col gap-4">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="form-btn"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" /> &nbsp;
                        Loading...
                      </>
                    ) : type === "sign-in" ? (
                      "Sign In"
                    ) : (
                      "Sign Up"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
            <footer className="flex justify-center gap-1">
              <p className="text-14 font-normal text-slate-400">
                {type === "sign-in"
                  ? "Don't have an account?"
                  : "Already have an account?"}
              </p>
              <Link
                className="form-link text-14 font-medium text-primary"
                href={type === "sign-in" ? "/sign-up" : "/sign-in"}
              >
                {type === "sign-in" ? "Sign up" : "Sign in"}
              </Link>
            </footer>
          </>
        )}
      </div>
    </section>
  );
};

export default AuthForm;
