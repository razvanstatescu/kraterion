"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ChevronDown } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type NavItem = { label: string; href: string };
type ProductItem = { label: string; href: string; lede: string };

export function MobileNav({
  navItems,
  productItems,
}: {
  navItems: NavItem[];
  productItems: ProductItem[];
}) {
  const [open, setOpen] = useState(false);
  const [productExpanded, setProductExpanded] = useState(false);

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
        href="mailto:hello@kraterion.com?subject=Beta%20access%20request"
        variant="primary"
        size="sm"
      >
        Get early access →
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
          className="fixed inset-0 z-[60] bg-ink text-cream"
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
          <nav className="flex flex-col gap-4 px-6 pt-6" aria-label="Mobile">
            <button
              type="button"
              className="flex items-center justify-between text-[24px] font-medium text-cream"
              onClick={() => setProductExpanded((v) => !v)}
              aria-expanded={productExpanded}
            >
              Product
              <ChevronDown
                size={20}
                strokeWidth={1.5}
                className={cn(
                  "transition-transform duration-[200ms]",
                  productExpanded ? "rotate-180" : ""
                )}
              />
            </button>
            {productExpanded && (
              <div className="ml-4 flex flex-col gap-3 border-l border-stone-800 pl-4">
                {productItems.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="text-[18px] text-stone-300 hover:text-cream"
                    onClick={() => setOpen(false)}
                  >
                    {p.label}
                  </Link>
                ))}
              </div>
            )}
            {navItems.map((item) => (
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
                href="/signin"
                className="text-[18px] text-stone-300"
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
              <ButtonLink
                href="mailto:hello@kraterion.com?subject=Beta%20access%20request"
                variant="primaryOnInk"
                size="lg"
                onClick={() => setOpen(false)}
              >
                Get early access →
              </ButtonLink>
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
