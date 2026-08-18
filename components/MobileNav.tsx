"use client";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { sidebarLinks } from "@/constants";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

const MobileNav = ({ user }: MobileNavProps) => {
  void user;
  const pathname = usePathname();

  return (
    <section className="w-full max-w-[264px]">
      <Sheet>
        <SheetTrigger asChild>
          <button className="flex size-10 items-center justify-center rounded-xl bg-slate-800/60 border border-slate-700/50 hover:bg-slate-700/60 transition-colors">
            <Menu size={20} className="text-slate-300" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="border-none bg-slate-900/95 backdrop-blur-2xl"
        >
          <Link
            href="/"
            className="cursor-pointer flex items-center gap-2 px-4"
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
            <h1 className="text-26 font-ibm-plex-serif font-bold text-slate-50">
              BankVerse
            </h1>
          </Link>
          <div className="mobilenav-sheet">
            <nav className="flex h-full flex-col gap-2 pt-16 text-white">
              {sidebarLinks.map((item) => {
                const isActive =
                  pathname === item.route ||
                  pathname.startsWith(`${item.route}/`);

                return (
                  <SheetClose asChild key={item.route}>
                    <Link
                      href={item.route}
                      key={item.label}
                      className={cn(
                        "mobilenav-sheet_close w-full",
                        isActive
                          ? "bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border border-blue-500/20"
                          : "border border-transparent"
                      )}
                    >
                      <div className="relative size-5 flex-shrink-0">
                        <Image
                          src={item.imgURL}
                          alt={item.label}
                          fill
                          className={cn("transition-all", {
                            "brightness-0 invert": isActive,
                            "opacity-50": !isActive,
                          })}
                        />
                      </div>
                      <p
                        className={cn("text-16 font-medium text-slate-400", {
                          "text-white font-semibold": isActive,
                        })}
                      >
                        {item.label}
                      </p>
                    </Link>
                  </SheetClose>
                );
              })}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
};

export default MobileNav;
