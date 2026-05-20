"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Heading = { id: string; label: string; level: 2 | 3 };

export function OnThisPage({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    const elements = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );
    elements.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav aria-label="On this page" className="sticky top-24 flex flex-col gap-2 text-[13px]">
      <h4 className="text-[11px] uppercase tracking-[0.16em] text-stone-500">On this page</h4>
      <ul className="flex flex-col gap-1">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn(
                "block py-1",
                h.level === 3 ? "pl-3" : "pl-0",
                active === h.id ? "text-ink" : "text-stone-600 hover:text-ink"
              )}
            >
              {h.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
