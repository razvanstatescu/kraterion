"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { KraterionWordmark } from "@/components/ui/KraterionWordmark";
import { ButtonLink } from "@/components/ui/Button";
import { MobileNav } from "./MobileNav";
import { NavMenu, type NavMenuDef } from "./NavMenu";
import { StorageGlyph, KnowledgeGlyph, AgentsGlyph } from "./NavGlyphs";

// Product menus, ordered as the product story flows: storage is the
// foundation, knowledge makes it answerable, agents are the runtime on top.
export const MENUS: NavMenuDef[] = [
  {
    label: "Storage",
    caption: "Sealed, owned objects.",
    visual: <StorageGlyph />,
    items: [
      { label: "Object storage", href: "/s3", lede: "S3-compatible buckets you own." },
      { label: "Security & ownership", href: "/security", lede: "Sealed, revocable, verifiable." },
    ],
  },
  {
    label: "Knowledge",
    caption: "Hybrid retrieval with citations.",
    visual: <KnowledgeGlyph />,
    items: [
      { label: "Knowledge bases", href: "/knowledge", lede: "Make your files answerable." },
      { label: "Embed widget", href: "/embed", lede: "A chat over your knowledge, anywhere." },
    ],
  },
  {
    label: "Agents",
    caption: "Every run recorded.",
    visual: <AgentsGlyph />,
    items: [
      { label: "Agents", href: "/agents", lede: "OpenAI-compatible, scoped by default." },
      { label: "Replay & audit", href: "/runs", lede: "Reproduce and verify any run." },
      { label: "Lineage", href: "/runs#lineage", lede: "Trace every output to its inputs." },
      { label: "Memory", href: "/memory", lede: "Memory agents choose to use." },
    ],
  },
];

export const FLAT_NAV = [
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openMenu]);

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
          {MENUS.map((menu, i) => (
            <NavMenu
              key={menu.label}
              menu={menu}
              align={i === MENUS.length - 1 ? "right" : "left"}
              isOpen={openMenu === menu.label}
              onOpen={setOpenMenu}
              onClose={() => setOpenMenu(null)}
            />
          ))}
          {FLAT_NAV.map((item) => (
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
          <Link href="https://app.kraterion.com/login" className="text-[14px] text-stone-700 hover:text-ink">
            Sign in
          </Link>
          <ButtonLink
            href="https://app.kraterion.com/login"
            variant="primary"
            size="sm"
          >
            Try Kraterion →
          </ButtonLink>
        </div>

        <MobileNav menus={MENUS} flatItems={FLAT_NAV} />
      </div>
    </header>
  );
}
