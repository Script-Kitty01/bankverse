"use client";

import AddBankModal from "./AddBankModal";

const PlaidLink = ({ user }: { user?: unknown }) => {
  void user;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-14 text-slate-400">
        Connect your bank account to get started with BankVerse. Link your
        current or savings accounts securely.
      </p>
      <AddBankModal
        buttonText="Connect Bank Account"
        className="w-full justify-center"
      />
    </div>
  );
};

export default PlaidLink;
