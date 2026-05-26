import type { Metadata } from "next";
import { Check, Minus } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { EgressCostBars } from "@/components/marketing/visuals/EgressCostBars";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { BookOpen, MessageCircle, Layers } from "lucide-react";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { TIERS } from "@/lib/mock/pricing";
import { cn } from "@/lib/cn";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing — Kraterion",
  description:
    "Predictable pricing. Cheap egress with a 50 GB free band — ~9× under AWS S3. No tier surprises, no retrieval fees.",
};

type TierKey = "free" | "pro" | "scale";
type Cell = string | boolean;

type GroupRow = { feature: string; values: Record<TierKey, Cell>; badge?: "Pro" | "Scale" };

type Group = { title: string; rows: GroupRow[] };

const GROUPS: Group[] = [
  {
    title: "Storage",
    rows: [
      { feature: "Storage included", values: { free: "500 MB", pro: "1 TB", scale: "10 TB" } },
      { feature: "Buckets", values: { free: "1", pro: "Unlimited", scale: "Unlimited" } },
      { feature: "Multipart uploads", values: { free: true, pro: true, scale: true } },
      { feature: "Lifecycle rules", values: { free: false, pro: true, scale: true }, badge: "Pro" },
      { feature: "Custom regions", values: { free: false, pro: false, scale: true }, badge: "Scale" },
    ],
  },
  {
    title: "Bandwidth",
    rows: [
      {
        feature: "Egress",
        values: {
          free: "50 GB free · then $0.01/GB",
          pro: "50 GB free · then $0.01/GB",
          scale: "50 GB free · then $0.01/GB",
        },
      },
      { feature: "Retrieval fees", values: { free: "$0", pro: "$0", scale: "$0" } },
      { feature: "Cross-region or cross-AZ surprises", values: { free: "$0", pro: "$0", scale: "$0" } },
      { feature: "Class A ops included", values: { free: "1M / mo", pro: "10M / mo", scale: "100M / mo" } },
    ],
  },
  {
    title: "Knowledge & Agents",
    rows: [
      { feature: "Knowledge layer", values: { free: false, pro: true, scale: true }, badge: "Pro" },
      { feature: "Agents", values: { free: false, pro: "5", scale: "Unlimited" }, badge: "Pro" },
      { feature: "Embed widget", values: { free: false, pro: true, scale: true }, badge: "Pro" },
      { feature: "Agent calls / mo", values: { free: false, pro: "100k", scale: "Unlimited" }, badge: "Pro" },
    ],
  },
  {
    title: "Security & support",
    rows: [
      { feature: "Sealed before upload", values: { free: true, pro: true, scale: true } },
      { feature: "Revocable access policies", values: { free: true, pro: true, scale: true } },
      { feature: "Audit log retention", values: { free: "7 days", pro: "30 days", scale: "1 year" } },
      { feature: "Email support", values: { free: "Community", pro: "Email", scale: "Email" } },
    ],
  },
];

const HONESTY_STATS = [
  { value: "$0.01", label: "Per GB egress", sub: "~9× under AWS S3" },
  { value: "50 GB", label: "Egress free band", sub: "Every project, every month" },
  { value: "$0", label: "Retrieval fees", sub: "No cold-tier penalty" },
  { value: "$0", label: "Tier surprises", sub: "Flat rate, no cliffs" },
];

const FAQ = [
  {
    q: "How much do you charge for egress?",
    a: "$0.01 per GB, with a 50 GB free band every month. That's about 9× cheaper than AWS S3's standard internet egress ($0.09/GB) — and it's a flat rate above the free band, not a tier-curve. You'll never get hit by a surprise cliff because a Hacker News post sent traffic.",
  },
  {
    q: "Why not zero egress, like Cloudflare R2?",
    a: "R2 cross-subsidizes egress from Cloudflare's existing CDN business. We don't have that lever — our reads pull through Walrus and require a Seal threshold call per sealed object, both of which cost real money. Charging $0 would mean burning cash on heavy readers, which isn't sustainable. $0.01/GB lets us absorb the infra cost honestly and stay roughly an order of magnitude under AWS.",
  },
  {
    q: "What happens if I leave?",
    a: "Run rclone, aws-cli, or any S3 client against your bucket and pull every byte. No proprietary export, no exit fee on top of egress. Walrus is content-addressed, so you can also pull straight from the network if you want to skip Kraterion entirely.",
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
      {/* Hero */}
      <section className="bg-cream pt-40 pb-12">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <FadeUp>
            <NumberedEyebrow n="00" label="Pricing" className="justify-center" />
            <h1 className="mx-auto mt-6 max-w-[920px] text-[44px] leading-[1.05] tracking-[-0.02em] md:text-[72px]">
              Predictable pricing.
              <br />
              <span className="text-stone-500">No egress traps.</span>
            </h1>
            <p className="mx-auto mt-8 max-w-[640px] text-[18px] text-stone-700">
              Cheap egress with a real free band — about 9× under AWS S3, with a flat rate above 50 GB free. No tier cliffs, no cross-region surprises.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* Tier cards */}
      <section className="bg-cream pt-12 pb-24 md:pb-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {TIERS.map((t) => (
              <FadeUp
                key={t.id}
                className={cn(
                  "relative flex flex-col rounded-lg border p-8",
                  t.highlight ? "border-krater/40 bg-cream" : "border-stone-200/60 bg-cream"
                )}
              >
                {t.highlight && (
                  <span className="absolute -top-3 left-8 inline-flex items-center gap-1.5 rounded-full bg-krater px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] font-medium text-cream">
                    Most popular
                  </span>
                )}
                <h3 className="text-[28px] leading-[1.2]">{t.name}</h3>
                <p className="mt-1 text-[14px] text-stone-600">{t.headline}</p>
                <div className="mt-8 flex items-baseline gap-2">
                  <span className="text-[56px] leading-[1] tracking-[-0.02em]">{t.price}</span>
                  <span className="text-[14px] text-stone-600">{t.period}</span>
                </div>
                <ul className="mt-10 flex flex-1 flex-col gap-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[14px] text-stone-700">
                      <Check size={14} strokeWidth={1.75} className="mt-1 shrink-0 text-stone-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-10">
                  <ButtonLink
                    href="mailto:hello@kraterion.com?subject=Beta%20access%20request"
                    variant={t.highlight ? "primary" : "secondary"}
                    size="md"
                    className="w-full"
                  >
                    {t.cta}
                  </ButtonLink>
                </div>
              </FadeUp>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-3 text-[14px] text-stone-600">
            <span>Need something custom?</span>
            <a
              href="mailto:hello@kraterion.com"
              className="font-medium text-ink underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
            >
              Talk to sales →
            </a>
          </div>
        </div>
      </section>

      {/* Honesty stat strip */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="No egress traps" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                The honest math.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] text-stone-700">
                Three providers, same workload, published rates. We sit between AWS S3 (the punishing egress curve) and Cloudflare R2 (cheapest pure $/GB, no client-side encryption or ownership) — about 83% under S3, with sealed objects and revocable access included.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12">
            <StatStrip stats={HONESTY_STATS} />
          </div>
          <div className="mt-8">
            <EgressCostBars />
          </div>
          <p className="mt-4 text-[12px] text-stone-500">
            S3 per aws.amazon.com/s3/pricing · R2 per developers.cloudflare.com/r2/pricing (May 2026). Independently verifiable.
          </p>
        </div>
      </section>

      {/* Feature groups */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="02" label="Compare every plan" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                What&apos;s in each tier.
              </h2>
            </div>
          </FadeUp>

          <div className="mt-12 flex flex-col gap-16">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <h3 className="text-[20px] leading-[1.2] font-medium text-ink">{g.title}</h3>
                <div className="mt-4 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
                  <div className="sticky top-16 z-10 grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-stone-200/60 bg-cream/85 px-4 py-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                    <span>Feature</span>
                    <span>Free</span>
                    <span>Pro</span>
                    <span>Scale</span>
                  </div>
                  {g.rows.map((r, i) => (
                    <div
                      key={r.feature}
                      className={cn(
                        "grid grid-cols-[2fr_1fr_1fr_1fr] items-center gap-2 px-4 py-3 text-[14px]",
                        i < g.rows.length - 1 && "border-b border-stone-200/60",
                        "hover:bg-stone-50"
                      )}
                    >
                      <span className="flex items-center gap-2 text-ink">
                        {r.feature}
                        {r.badge && (
                          <span className="rounded-sm border border-stone-200/60 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] font-medium text-stone-500">
                            {r.badge}+
                          </span>
                        )}
                      </span>
                      {(["free", "pro", "scale"] as const).map((k) => (
                        <Value key={k} v={r.values[k]} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BridgeHeadline align="left">
        Storage you can leave.
        <br />
        <span className="text-stone-500">Without paying a bill to do it.</span>
      </BridgeHeadline>

      {/* FAQ */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1080px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="03" label="FAQ" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Questions worth answering.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 divide-y divide-stone-200/60 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
            {FAQ.map((q) => (
              <details key={q.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer items-center justify-between text-[15px] font-medium text-ink">
                  {q.q}
                  <span aria-hidden className="text-stone-400 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[14px] leading-[1.65] text-stone-700">{q.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Predictable"
        headline={
          <>
            Start with 500 MB.
            <br />
            <span className="text-stone-500">Free, forever.</span>
          </>
        }
        primaryHref="mailto:hello@kraterion.com?subject=Beta%20access%20request"
        primaryLabel="Request beta access →"
        sub="No card required. Pay for storage when you grow. Egress is cheap, not free — 50 GB on the house every month."
        satellites={[
          { icon: Layers, label: "Compare plans", detail: "Free, Pro, Scale — feature by feature.", href: "#" },
          { icon: BookOpen, label: "Read the docs", detail: "Same S3 API, same commands.", href: "/docs" },
          { icon: MessageCircle, label: "Talk to us", detail: "Volume pricing, custom regions, beta access.", href: "mailto:hello@kraterion.com" },
        ]}
      />
    </>
  );
}

function Value({ v }: { v: Cell }) {
  if (v === true) {
    return <Check size={14} strokeWidth={2} className="text-[color:var(--color-success)]" />;
  }
  if (v === false) {
    return <Minus size={14} strokeWidth={1.5} className="text-stone-400" />;
  }
  return <span className="text-stone-700">{v}</span>;
}
