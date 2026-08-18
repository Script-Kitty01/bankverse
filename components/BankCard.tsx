import { formatAmount } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { Wifi } from "lucide-react";

const BankCard = ({
  account,
  userName,
  showBalance = true,
}: CreditCardProps) => {
  void showBalance;
  return (
    <div className="flex flex-col">
      <Link
        href={`/transaction-history/?id=${account.appwriteItemId}`}
        className="bank-card group"
      >
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 rounded-[20px] bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15)_0%,_transparent_60%)] pointer-events-none" />

        <div className="bank-card_content">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-16 font-semibold text-white/90">
                {account.name}
              </h1>
            </div>
            <p className="font-ibm-plex-serif font-bold text-xl text-white tracking-tight">
              {formatAmount(account.currentBalance)}
            </p>
          </div>

          <article className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <h1 className="text-12 font-medium text-white/70 uppercase tracking-wider">
                {userName}
              </h1>
              <span className="text-11 font-medium text-white/50 bg-white/10 px-2 py-0.5 rounded-full">
                {account.type || "SAVINGS"}
              </span>
            </div>
            <p className="text-14 font-mono font-medium tracking-[2px] text-white/80">
              ●●●● ●●●● ●●●●{" "}
              <span className="text-16 font-bold text-white">
                {account?.mask}
              </span>
            </p>
          </article>
        </div>

        <div className="bank-card_icon">
          <Wifi size={18} className="text-white/60 rotate-90" />
          <div className="flex items-center gap-1 mt-auto">
            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">₹</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center -ml-2">
              <span className="text-[10px] font-bold text-white">UPI</span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default BankCard;
