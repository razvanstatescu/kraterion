import { ArrowUpRight } from "lucide-react";
import { FadeUp } from "@/components/motion/FadeUp";
import { BrandLogo, BRAND_URL, WALRUS_MEMORY_URL, type Brand } from "./BrandLogo";

/**
 * HowItsBuilt — maps each underlying primitive to the plain-language capability
 * it provides. Names Walrus / Sui / Seal / Walrus Memory (the mechanism) under
 * a web2 benefit, so the depth of the stack is legible without crypto jargon.
 *
 * Each card links out to that tech's official site ("Learn more"). Logos render
 * in their own colors on the cream cards; Walrus Memory has no logo asset, so it
 * shows as a text wordmark.
 */

type Layer = {
  brand?: Brand;
  name?: string;
  h?: number;
  role: string;
  body: string;
  href: string;
};

const STACK: Layer[] = [
  {
    brand: "walrus",
    h: 16,
    role: "Storage",
    body: "Your files, run records, and memory live on a decentralized storage network — not in our database.",
    href: BRAND_URL.walrus,
  },
  {
    brand: "seal",
    h: 15,
    role: "Encryption",
    body: "Everything is sealed before upload. We hold the data; we can't read it.",
    href: BRAND_URL.seal,
  },
  {
    brand: "sui",
    h: 20,
    role: "Ownership & audit",
    body: "Ownership, access, and a tamper-evident record live on-chain — so you can grant, revoke, and verify.",
    href: BRAND_URL.sui,
  },
  {
    name: "Walrus Memory",
    role: "Agent memory",
    body: "Persistent agent memory that's portable and owned by you, not locked in our database.",
    href: WALRUS_MEMORY_URL,
  },
];

export function HowItsBuilt() {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
      {STACK.map((layer, i) => (
        <FadeUp key={layer.brand ?? layer.name} delay={i * 0.06}>
          <a
            href={layer.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-full flex-col bg-cream p-8 transition-colors hover:bg-stone-50 md:p-10"
          >
            <div className="flex h-7 items-center">
              {layer.brand ? (
                <BrandLogo brand={layer.brand} h={layer.h ?? 16} />
              ) : (
                <span className="text-[15px] font-medium tracking-[0.01em] text-ink">
                  {layer.name}
                </span>
              )}
            </div>
            <h3 className="mt-5 text-[20px] leading-[1.25] text-ink">{layer.role}</h3>
            <p className="mt-2 flex-1 text-[14px] leading-[1.65] text-stone-700">
              {layer.body}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-stone-500 group-hover:text-krater">
              Learn more
              <ArrowUpRight
                size={14}
                strokeWidth={1.5}
                className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </span>
          </a>
        </FadeUp>
      ))}
    </div>
  );
}
