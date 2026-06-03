"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const GROUPS = [
  {
    title: "Getting started",
    items: [
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "Concepts", href: "/docs#concepts" },
    ],
  },
  {
    title: "SDKs",
    items: [
      { label: "LangGraph", href: "/docs/langgraph" },
      { label: "Vercel AI SDK", href: "/docs/vercel-ai-sdk" },
    ],
  },
  {
    title: "S3 API",
    items: [
      { label: "Endpoints", href: "/docs#s3-endpoints" },
      { label: "Authentication", href: "/docs#s3-auth" },
      { label: "Operations", href: "/docs#s3-ops" },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { label: "Indexing", href: "/docs#knowledge-indexing" },
      { label: "Retrieval", href: "/docs#knowledge-retrieval" },
    ],
  },
  {
    title: "Agents",
    items: [
      { label: "Endpoints", href: "/docs#agents-endpoints" },
      { label: "Tools", href: "/docs#agents-tools" },
    ],
  },
  {
    title: "Embed",
    items: [{ label: "Script tag", href: "/docs#embed-script" }],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="flex flex-col gap-8 py-8 pr-4 text-[14px]">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <h4 className="text-[11px] uppercase tracking-[0.16em] text-stone-500">
            {g.title}
          </h4>
          <ul className="mt-3 flex flex-col gap-1">
            {g.items.map((item) => {
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-sm px-3 py-1.5",
                      "border-l-2",
                      active
                        ? "border-krater bg-stone-50 text-ink"
                        : "border-transparent text-stone-700 hover:bg-stone-50 hover:text-ink"
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
