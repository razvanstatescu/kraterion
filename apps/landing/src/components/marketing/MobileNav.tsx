"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { NavMenuDef } from "./NavMenu";

type FlatItem = { label: string; href: string };

export function MobileNav({
  menus,
  flatItems,
}: {
  menus: NavMenuDef[];
  flatItems: FlatItem[];
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(menus[0]?.label ?? null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden flex items-center gap-2">
      <ButtonLink
        href="https://app.kraterion.com/login"
        variant="primary"
        size="sm"
      >
        Try Kraterion →
      </ButtonLink>
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid place-items-center h-9 w-9 rounded-md hover:bg-stone-100"
      >
        {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
      </button>

      {open && (
        <div
          data-lenis-prevent
          className="fixed inset-0 z-[60] overflow-y-auto bg-ink text-cream"
          style={{ animation: "iris-open 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          <div className="flex h-16 items-center justify-between px-6">
            <span className="text-[15px] font-medium text-cream tracking-[0.06em]">Kraterion</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="grid place-items-center h-9 w-9 rounded-md hover:bg-stone-800"
            >
              <X size={20} strokeWidth={1.5} />
            </button>
          </div>
          <nav className="flex flex-col gap-4 px-6 pb-16 pt-6" aria-label="Mobile">
            {menus.map((menu) => {
              const isOpen = expanded === menu.label;
              return (
                <div key={menu.label}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-[24px] font-medium text-cream"
                    onClick={() => setExpanded(isOpen ? null : menu.label)}
                    aria-expanded={isOpen}
                  >
                    {menu.label}
                    <ChevronDown
                      size={20}
                      strokeWidth={1.5}
                      className={cn("transition-transform duration-[200ms]", isOpen && "rotate-180")}
                    />
                  </button>
                  {isOpen && (
                    <div className="mt-3 ml-4 flex flex-col gap-3 border-l border-stone-800 pl-4">
                      {menu.items.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="text-[18px] text-stone-300 hover:text-cream"
                          onClick={() => setOpen(false)}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {flatItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[24px] font-medium text-cream"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="https://app.kraterion.com/login"
                className="text-[18px] text-stone-300"
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
              <ButtonLink
                href="https://app.kraterion.com/login"
                variant="primaryOnInk"
                size="lg"
                onClick={() => setOpen(false)}
              >
                Try Kraterion →
              </ButtonLink>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
