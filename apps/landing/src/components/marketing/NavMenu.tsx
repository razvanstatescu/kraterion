"use client";

import Link from "next/link";
import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type MenuItem = { label: string; href: string; lede: string };
export type NavMenuDef = {
  label: string;
  items: MenuItem[];
  visual: React.ReactNode;
  caption: string;
};

/**
 * NavMenu — one dropdown in the primary nav. A grouped list of links paired with
 * a minimalist section visual (mega-menu style, kept compact and on-brand).
 *
 * Open state is owned by the parent so only one menu shows at a time. Opens on
 * hover (with intent delay) and on click; closes on leave, click, or Escape.
 * The panel sits in a `pt-2` bridge so the pointer can travel from trigger to
 * panel without dismissing it (WCAG 1.4.13 — hoverable + persistent).
 */
export function NavMenu({
  menu,
  align = "left",
  isOpen,
  onOpen,
  onClose,
}: {
  menu: NavMenuDef;
  align?: "left" | "right";
  isOpen: boolean;
  onOpen: (label: string) => void;
  onClose: () => void;
}) {
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  };

  const enter = () => {
    clearTimers();
    openTimer.current = window.setTimeout(() => onOpen(menu.label), 120);
  };
  const leave = () => {
    clearTimers();
    closeTimer.current = window.setTimeout(onClose, 140);
  };

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        className="flex items-center gap-1 px-3 py-2 text-[14px] text-stone-700 hover:text-ink"
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => (isOpen ? onClose() : onOpen(menu.label))}
      >
        {menu.label}
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn("transition-transform duration-[200ms]", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            "absolute top-full z-50 pt-2",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          <div
            className="w-[560px] rounded-lg border border-stone-300/70 bg-cream p-3"
            role="group"
            aria-label={menu.label}
            style={{ animation: "iris-open 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
          >
            <div className="grid grid-cols-[1fr_220px] gap-3">
              {/* Links */}
              <ul className="flex flex-col justify-center">
                {menu.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-md px-3 py-3 hover:bg-stone-100"
                      onClick={onClose}
                    >
                      <div className="text-[15px] font-medium text-ink">{item.label}</div>
                      <div className="text-[13px] leading-[1.45] text-stone-600">{item.lede}</div>
                    </Link>
                  </li>
                ))}
              </ul>

              {/* Section visual */}
              <div className="flex flex-col rounded-md border border-stone-200/60 bg-stone-50 p-5">
                <div className="flex flex-1 items-center justify-center">{menu.visual}</div>
                <div className="mt-5 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  {menu.caption}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
