import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { SectionFrame } from "@/components/marketing/SectionFrame";
import { PricingTeaser } from "@/components/marketing/PricingTeaser";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing — Kraterion",
  description:
    "Predictable pricing. No egress traps. No retrieval fees. No surprise bill on a busy weekend.",
};

type TierKey = "free" | "pro" | "scale";

type Row = {
  feature: string;
  values: Record<TierKey | "talk", string | boolean>;
};

const ROWS: Row[] = [
  { feature: "Storage", values: { free: "5 GB", pro: "1 TB", scale: "10 TB", talk: "Custom" } },
  { feature: "Buckets", values: { free: "1", pro: "Unlimited", scale: "Unlimited", talk: "Unlimited" } },
  { feature: "S3 API", values: { free: true, pro: true, scale: true, talk: true } },
  { feature: "Knowledge layer", values: { free: false, pro: true, scale: true, talk: true } },
  { feature: "Agents", values: { free: false, pro: "5", scale: "Unlimited", talk: "Unlimited" } },
  { feature: "Embed widget", values: { free: false, pro: true, scale: true, talk: true } },
  { feature: "Custom regions", values: { free: false, pro: false, scale: true, talk: true } },
  { feature: "SSO", values: { free: false, pro: false, scale: true, talk: true } },
  { feature: "Audit log retention", values: { free: "7 days", pro: "30 days", scale: "1 year", talk: "Custom" } },
  { feature: "Priority support", values: { free: false, pro: false, scale: true, talk: true } },
  { feature: "SLA", values: { free: false, pro: false, scale: "99.9%", talk: "Custom" } },
  { feature: "Custom DPA", values: { free: false, pro: false, scale: true, talk: true } },
  { feature: "Egress fees", values: { free: "$0", pro: "$0", scale: "$0", talk: "$0" } },
  { feature: "Retrieval fees", values: { free: "$0", pro: "$0", scale: "$0", talk: "$0" } },
];

const FAQ = [
  {
    q: "Do you really charge $0 for egress?",
    a: "Yes. You pay for storage, not for reading what you put in. We've benchmarked this against R2's $0.015/GB-month standard storage with zero egress.",
  },
  {
    q: "What happens if I leave?",
    a: "Run rclone, aws-cli, or any S3 client against your bucket and pull every byte. No proprietary export, no exit fee.",
  },
  {
    q: "How is storage measured?",
    a: "Logical bytes stored, averaged over a billing month. Indexed knowledge does not double-bill — index storage is included in each tier.",
  },
  {
    q: "Do prices include indexing?",
    a: "Yes. Knowledge indexing is included on Pro and Scale. Agents are billed per request; the tier limit is the included monthly budget.",
  },
  {
    q: "Can I downgrade?",
    a: "Any time. If your usage exceeds the new tier, you'll be metered at the next tier's overage rate until the next month.",
  },
  {
    q: "Do you offer educational or non-profit discounts?",
    a: "Yes — write to hello@kraterion.com from your institutional email.",
  },
];

export default function Page() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream pt-40 pb-12">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <FadeUp>
            <p className="micro text-stone-500">Pricing</p>
            <h1 className="mx-auto mt-4 max-w-[860px] text-[40px] leading-[1.05] tracking-[-0.02em] md:text-[64px]">
              Predictable pricing. No egress traps.
            </h1>
            <p className="mx-auto mt-6 max-w-[640px] text-[18px] text-stone-700">
              You store; you pay for storage. We don't penalize you for reading what you put in.
            </p>
          </FadeUp>
        </div>
      </section>

      <SectionFrame>
        <PricingTeaser />
        <div className="mt-8 text-center">
          <a href="mailto:hello@kraterion.com" className="text-[14px] text-stone-600 underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
            Talk to sales
          </a>
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="Compare every plan"
        headline="Side by side."
      >
        <div className="overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
          <div className="sticky top-16 z-10 grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-stone-200/60 bg-cream/85 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-stone-500">
            <span>Feature</span>
            <span>Free</span>
            <span>Pro</span>
            <span>Scale</span>
            <span>Talk to us</span>
          </div>
          {ROWS.map((r) => (
            <div
              key={r.feature}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] items-center gap-2 border-b border-stone-200/60 px-4 py-3 text-[14px] last:border-b-0 hover:bg-stone-50"
            >
              <span className="text-ink">{r.feature}</span>
              {(["free", "pro", "scale", "talk"] as const).map((k) => (
                <Value key={k} v={r.values[k]} />
              ))}
            </div>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="No egress traps"
        headline="What you actually pay."
        lede="A side-by-side with named alternatives. We benchmark against Cloudflare R2 because it sets the public bar for standard object storage."
      >
        <div className="overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-stone-500">
            <span>Cost component</span>
            <span>Cloudflare R2</span>
            <span>Kraterion</span>
          </div>
          {[
            ["Storage (Standard, $/GB-month)", "$0.015", "$0.012"],
            ["Egress (per GB read)", "$0.00", "$0.00"],
            ["Class A operations (1M)", "$4.50", "$3.00"],
            ["Class B operations (1M)", "$0.36", "$0.20"],
            ["Free tier (per month)", "10 GB + 1M Class A", "5 GB + 1M Class A"],
          ].map(([label, r2, kr]) => (
            <div
              key={label}
              className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 border-b border-stone-200/60 px-4 py-3 text-[14px] last:border-b-0"
            >
              <span className="text-ink">{label}</span>
              <span className="text-stone-700">{r2}</span>
              <span className="font-medium text-ink">{kr}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] text-stone-500">
          R2 pricing per developers.cloudflare.com/r2/pricing/ (May 2026). Independently verifiable.
        </p>
      </SectionFrame>

      <SectionFrame
        eyebrow="FAQ"
        headline="The questions worth answering."
      >
        <div className="divide-y divide-stone-200/60 rounded-lg border border-stone-200/60 bg-cream">
          {FAQ.map((q) => (
            <details key={q.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer items-center justify-between text-[15px] font-medium text-ink">
                {q.q}
                <span aria-hidden className="text-stone-400 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-[14px] text-stone-700">{q.a}</p>
            </details>
          ))}
        </div>
      </SectionFrame>

      <section className="bg-cream">
        <div className="mx-auto max-w-[1280px] px-6 py-32 text-center">
          <FadeUp>
            <h2 className="mx-auto max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
              Start a bucket in 30 seconds.
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-10 flex justify-center">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free →</ButtonLink>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  );
}

function Value({ v }: { v: string | boolean }) {
  if (v === true) {
    return <Check size={14} strokeWidth={2} className="text-[color:var(--color-success)]" />;
  }
  if (v === false) {
    return <Minus size={14} strokeWidth={1.5} className="text-stone-400" />;
  }
  return <span className="text-stone-700">{v}</span>;
}
