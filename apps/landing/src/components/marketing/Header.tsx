"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { KraterionWordmark } from "@/components/ui/KraterionWordmark";
import { ButtonLink } from "@/components/ui/Button";
import { MobileNav } from "./MobileNav";

const NAV = [
  { label: "S3", href: "/s3" },
  { label: "Knowledge", href: "/knowledge" },
  { label: "Embed", href: "/embed" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

const PRODUCT_ITEMS = [
  { label: "Object storage", href: "/s3", lede: "S3-compatible buckets." },
  { label: "Knowledge layer", href: "/knowledge", lede: "Searchable, indexed files." },
  { label: "Agents", href: "/knowledge#agents", lede: "OpenAI-compatible endpoints." },
  { label: "Embed widget", href: "/embed", lede: "One-line chat on any site." },
  { label: "Security", href: "/security", lede: "Sealed, revocable, verifiable." },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!productOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProductOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [productOpen]);

  const openMenu = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = window.setTimeout(() => setProductOpen(true), 160);
  };
  const closeMenu = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setProductOpen(false), 120);
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 h-16",
        "transition-colors duration-[200ms]",
        scrolled
          ? "bg-cream/85 supports-[backdrop-filter]:backdrop-blur-md border-b border-stone-200/60"
          : "bg-transparent"
      )}
    >
      <div className="mx-auto flex h-full max-w-[1280px] items-center justify-between px-6">
        <Link href="/" aria-label="Kraterion home" className="flex items-center">
          <KraterionWordmark size={22} />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <div
            className="relative"
            onMouseEnter={openMenu}
            onMouseLeave={closeMenu}
          >
            <button
              type="button"
              className="flex items-center gap-1 px-3 py-2 text-[14px] text-stone-700 hover:text-ink"
              aria-haspopup="true"
              aria-expanded={productOpen}
              onClick={() => setProductOpen((v) => !v)}
            >
              Product
              <ChevronDown size={14} strokeWidth={1.5} />
            </button>
            {productOpen && (
              <div
                className={cn(
                  "absolute left-0 top-full mt-1 w-[320px] origin-top-left",
                  "rounded-lg border border-stone-200/60 bg-cream p-2"
                )}
                role="menu"
                style={{ animation: "iris-open 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
              >
                {PRODUCT_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className="block rounded-md px-3 py-2 hover:bg-stone-100"
                    onClick={() => setProductOpen(false)}
                  >
                    <div className="text-[15px] font-medium text-ink">{item.label}</div>
                    <div className="text-[13px] text-stone-600">{item.lede}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-[14px] text-stone-700 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/signin" className="text-[14px] text-stone-700 hover:text-ink">
            Sign in
          </Link>
          <ButtonLink href="/signup" variant="primary" size="sm">
            Start free →
          </ButtonLink>
        </div>

        <MobileNav navItems={NAV} productItems={PRODUCT_ITEMS} />
      </div>
    </header>
  );
}
