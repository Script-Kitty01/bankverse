"use client";
import { sidebarLinks } from "@/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { LogOut, ChevronRight } from "lucide-react";

const Sidebar = ({ user }: SidebarProps) => {
  const pathname = usePathname();
  return (
    <section className="sidebar flex flex-col justify-between overflow-y-auto no-scrollbar">
      <nav className="flex flex-col gap-1 xl:gap-1.5">
        <Link
          href="/"
          className="mb-6 cursor-pointer flex items-center gap-2 px-2"
        >
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-900/30">
            <Image
              src="/icons/logo.svg"
              width={22}
              height={22}
              alt="BankVerse"
              className="brightness-0 invert"
            />
          </div>
          <h1 className="sidebar-logo">BankVerse</h1>
        </Link>

        <div className="px-2 mb-2">
          <p className="text-11 font-semibold uppercase tracking-[0.2em] text-slate-500">
            Menu
          </p>
        </div>

        {sidebarLinks.map((item) => {
          const isActive =
            pathname === item.route || pathname.startsWith(`${item.route}/`);
          return (
            <Link
              href={item.route}
              key={item.label}
              className={cn(
                "sidebar-link group relative",
                isActive
                  ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border border-blue-500/20"
                  : "border border-transparent"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 bg-gradient-to-b from-blue-400 to-indigo-400 rounded-r-full" />
              )}
              <div className="relative size-5 flex-shrink-0">
                <Image
                  alt={item.label}
                  src={item.imgURL}
                  fill
                  className={cn("transition-all duration-200", {
                    "brightness-0 invert": isActive,
                    "opacity-50 group-hover:opacity-80": !isActive,
                  })}
                />
              </div>
              <p
                className={cn("sidebar-label", {
                  "text-white font-semibold": isActive,
                })}
              >
                {item.label}
              </p>
              {isActive && (
                <ChevronRight
                  size={14}
                  className="ml-auto text-blue-400 max-xl:hidden"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-3 pb-6 mt-auto">
        <div className="mx-2 rounded-xl bg-slate-800/40 border border-slate-700/30 p-3 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-sm shadow-md shadow-blue-900/20 ring-2 ring-blue-500/20">
            {user?.firstName?.[0] || "U"}
          </div>
          <div className="flex flex-col max-xl:hidden min-w-0">
            <p className="text-14 font-semibold text-slate-200 truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-12 text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-slate-800/40 transition-all text-slate-500 hover:text-slate-300">
          <LogOut size={18} />
          <span className="text-14 font-medium max-xl:hidden">Logout</span>
        </button>
      </div>
    </section>
  );
};

export default Sidebar;
