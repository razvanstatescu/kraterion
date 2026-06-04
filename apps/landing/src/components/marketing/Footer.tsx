import Link from "next/link";
import { KraterionMark } from "@/components/ui/KraterionMark";
import { BrandLogo, BRAND_URL } from "./BrandLogo";
import { cn } from "@/lib/cn";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Agents", href: "/agents" },
      { label: "Replay & audit", href: "/runs" },
      { label: "Audit trail", href: "/runs#lineage" },
      { label: "Memory", href: "/memory" },
      { label: "Knowledge layer", href: "/knowledge" },
      { label: "Object storage", href: "/s3" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
      { label: "LangGraph", href: "/docs/langgraph" },
      { label: "Vercel AI SDK", href: "/docs/vercel-ai-sdk" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Security", href: "/security" },
      { label: "Status", href: "https://status.kraterion.com" },
      { label: "Changelog", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Contact", href: "mailto:hello@kraterion.com" },
      { label: "Customers", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "DPA", href: "/legal/dpa" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-ink text-cream">
      <div className="mx-auto max-w-[1280px] px-6 pt-24 pb-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-5">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[11px] uppercase tracking-[0.16em] text-stone-400">
                {col.title}
              </h4>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[14px] text-stone-300 hover:text-cream"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Built on — tech attribution (every page) */}
        <div className="mt-16 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-stone-800 pt-8">
          <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
            Built on
          </span>
          <span className="flex flex-wrap items-center gap-x-5 gap-y-3 text-stone-300">
            <a href={BRAND_URL.walrus} target="_blank" rel="noopener noreferrer" className="inline-flex transition-colors hover:text-cream">
              <BrandLogo brand="walrus" tone="mono" h={14} />
            </a>
            <span aria-hidden className="h-3 w-px bg-stone-700" />
            <a href={BRAND_URL.seal} target="_blank" rel="noopener noreferrer" className="inline-flex transition-colors hover:text-cream">
              <BrandLogo brand="seal" tone="mono" h={13} />
            </a>
            <span aria-hidden className="h-3 w-px bg-stone-700" />
            <a href={BRAND_URL.sui} target="_blank" rel="noopener noreferrer" className="inline-flex transition-colors hover:text-cream">
              <BrandLogo brand="sui" tone="mono" h={18} />
            </a>
          </span>
          <span className="text-[13px] text-stone-500">
            Agent memory by{" "}
            <a
              href="https://memwal.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-300 underline underline-offset-4 decoration-stone-600 hover:text-cream"
            >
              Walrus Memory
            </a>
          </span>
        </div>

        <div className="mt-12 flex flex-col items-start gap-4 border-t border-stone-800 pt-8 md:flex-row md:items-center md:justify-between">
          <span
            className={cn(
              "inline-flex items-center gap-[10px] text-[15px] font-medium text-cream"
            )}
            style={{ letterSpacing: "0.06em" }}
          >
            <KraterionMark variant="mono" size={22} />
            <span>Kraterion</span>
          </span>
          <div className="text-[13px] text-stone-400">© 2026 Kraterion</div>
          <div className="flex items-center gap-2 text-[13px] text-stone-300">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-current"
            />
            All systems normal
          </div>
        </div>
      </div>
    </footer>
  );
}
