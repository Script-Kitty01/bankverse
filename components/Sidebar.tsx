"use client";
import { sidebarLinks } from "@/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";
import { LogOut } from "lucide-react";

const Sidebar = ({ user }: SidebarProps) => {
  const pathname = usePathname();
  return (
    <section className="sidebar flex flex-col justify-between overflow-y-auto no-scrollbar">
      <nav className="flex flex-col gap-2 xl:gap-3">
        <Link href="/" className="mb-4 cursor-pointer flex items-center gap-2">
          <Image
            src="/icons/logo.svg"
            width={34}
            height={34}
            alt="logo"
            className="size-[24px] max-xl:size-14"
          />
          <h1 className="sidebar-logo">BankVerse</h1>
        </Link>
        {sidebarLinks.map((item) => {
          const isActive =
            pathname === item.route || pathname.startsWith(`${item.route}/`);
          return (
            <Link
              href={item.route}
              key={item.label}
              className={cn("sidebar-link group", {
                "bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md": isActive,
              })}
            >
              <div className="relative size-6">
                <Image
                  alt={item.label}
                  src={item.imgURL}
                  fill
                  className={cn("transition-all", {
                    "brightness-0 invert": isActive,
                    "group-hover:opacity-80": !isActive,
                  })}
                />
              </div>
              <p
                className={cn("sidebar-label", {
                  "text-white": isActive,
                })}
              >
                {item.label}
              </p>
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-3 pb-6">
        <div className="flex items-center gap-3 px-4 py-2">
          <div className="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-semibold text-sm shadow-md">
            {user?.firstName?.[0] || "U"}
          </div>
          <div className="flex flex-col max-xl:hidden">
            <p className="text-14 font-semibold text-gray-900">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-12 text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button className="flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-white/40 transition-all text-gray-600">
          <LogOut size={20} />
          <span className="text-14 font-medium max-xl:hidden">Logout</span>
        </button>
      </div>
    </section>
  );
};

export default Sidebar;
