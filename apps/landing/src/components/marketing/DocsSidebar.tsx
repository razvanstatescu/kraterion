"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const GROUPS = [
  {
    title: "Getting started",
    items: [
      { label: "Introduction", href: "/docs" },
      { label: "Concepts", href: "/docs/concepts" },
      { label: "Quickstart", href: "/docs/quickstart" },
    ],
  },
  {
    title: "Agents",
    items: [
      { label: "Overview", href: "/docs/agents" },
      { label: "Tools", href: "/docs/agents/tools" },
      { label: "Chat API", href: "/docs/agents/chat-api" },
      { label: "Memory & sessions", href: "/docs/agents/memory" },
      { label: "Embed & share", href: "/docs/agents/embed" },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { label: "Overview", href: "/docs/knowledge" },
      { label: "Search & citations", href: "/docs/knowledge/search" },
    ],
  },
  {
    title: "Storage",
    items: [
      { label: "Buckets & S3 API", href: "/docs/s3-api" },
      { label: "API keys", href: "/docs/api-keys" },
    ],
  },
  {
    title: "MCP",
    items: [{ label: "Connect a client", href: "/docs/mcp" }],
  },
  {
    title: "How it works",
    items: [{ label: "Architecture", href: "/docs/architecture" }],
  },
  {
    title: "Roadmap",
    items: [{ label: "Coming soon", href: "/docs/roadmap" }],
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
