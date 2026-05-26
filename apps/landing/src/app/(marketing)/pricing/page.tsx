import type { Metadata } from "next";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { EgressCostBars } from "@/components/marketing/visuals/EgressCostBars";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { BookOpen, MessageCircle, BarChart3 } from "lucide-react";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { PricingCalculator } from "@/components/marketing/PricingCalculator";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Pricing — Kraterion",
  description:
    "Pay-as-you-go pricing with a generous free band on every meter. No flat tiers, no minimums, no surprise cliffs.",
};

const HONESTY_STATS = [
  { value: "$0.01", label: "Per GB egress", sub: "~9× under AWS S3" },
  { value: "50 GB", label: "Egress free band", sub: "Every project, every month" },
  { value: "$0", label: "Retrieval fees", sub: "No cold-tier penalty" },
  { value: "$0", label: "Tier surprises", sub: "Flat rate, no cliffs" },
];

const METERS = [
  {
    name: "Storage",
    description: "Object bytes stored, averaged over the month",
    free: "500 MB",
    freeUnit: "/ mo",
    rate: "$0.06",
    rateUnit: "/ GB-month",
  },
  {
    name: "Reads",
    description: "GET / HEAD / LIST operations on the S3 API",
    free: "1M ops",
    freeUnit: "/ mo",
    rate: "$0.40",
    rateUnit: "/ M ops",
  },
  {
    name: "Writes",
    description: "PUT / DELETE operations on the S3 API",
    free: "1k ops",
    freeUnit: "/ mo",
    rate: "$5.00",
    rateUnit: "/ M ops",
  },
  {
    name: "Egress",
    description: "Bytes leaving our edge — ~9× under AWS S3",
    free: "50 GB",
    freeUnit: "/ mo",
    rate: "$0.01",
    rateUnit: "/ GB",
  },
  {
    name: "Knowledge index",
    description: "Indexed chunks + vector embeddings, billed by GB-day",
    free: "1 GB-day",
    freeUnit: "/ mo",
    rate: "$0.10",
    rateUnit: "/ GB-day",
  },
  {
    name: "Agent messages",
    description: "Chat completions via your own model key",
    free: "—",
    freeUnit: "BYOK",
    rate: "$0",
    rateUnit: "to Kraterion",
  },
  {
    name: "Public-link egress",
    description: "Bytes served through embed-widget share tokens",
    free: "—",
    freeUnit: "no separate free band",
    rate: "$0.01",
    rateUnit: "/ GB",
  },
];

const FAQ = [
  {
    q: "How does the pricing model work?",
    a: "Pure pay-as-you-go. Every billable resource has a generous monthly free band and a flat per-unit rate above it. No flat tiers, no minimums, no cancellation fees, no cliff jumps when you cross a threshold — the rate at 1 GB is the same as at 1 TB.",
  },
  {
    q: "How much do you charge for egress?",
    a: "$0.01 per GB, with a 50 GB free band every month. That's about 9× cheaper than AWS S3's standard internet egress ($0.09/GB) — and it's a flat rate above the free band, not a tier-curve. You'll never get hit by a surprise cliff because a Hacker News post sent traffic.",
  },
  {
    q: "Why not zero egress, like Cloudflare R2?",
    a: "R2 cross-subsidizes egress from Cloudflare's existing CDN business. We don't have that lever — our reads pull through Walrus and require a Seal threshold call per sealed object, both of which cost real money. Charging $0 would mean burning cash on heavy readers, which isn't sustainable. $0.01/GB lets us absorb the infra cost honestly and stay roughly an order of magnitude under AWS.",
  },
  {
    q: "What does BYOK mean for agents?",
    a: "Kraterion only runs agent chat completions through your own model provider (OpenAI, Anthropic, etc.) — you bring the key. Kraterion bills you $0 for the agent call itself; you pay your model provider directly at their published per-token rates. Agent invocations are still tracked in your audit log either way.",
  },
  {
    q: "What happens if I leave?",
    a: "Run rclone, aws-cli, or any S3 client against your bucket and pull every byte. No proprietary export, no exit fee on top of standard egress. Walrus is content-addressed, so you can also pull straight from the network if you want to skip Kraterion entirely.",
  },
  {
    q: "How is storage measured?",
    a: "Logical bytes stored, averaged over a billing month. The first 500 MB are free every month. Indexed chunks for the knowledge layer are billed separately on the knowledge index meter — there's no double-billing.",
  },
  {
    q: "Is there a free trial?",
    a: "There's no separate trial — every project starts under the free band on every meter. A static portfolio, docs bucket, or weekend experiment fits inside the free bands and costs $0 indefinitely. Cards are only required when usage crosses a metered threshold.",
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
      <section className="bg-cream pt-32 pb-12 md:pt-40">
        <div className="mx-auto max-w-[1280px] px-6 text-center">
          <FadeUp>
            <NumberedEyebrow n="00" label="Pricing" className="justify-center" />
            <h1 className="mx-auto mt-6 max-w-[860px] text-[40px] leading-[1.04] tracking-[-0.02em] md:text-[60px] md:leading-[1.02]">
              Pay for what you use.
              <br />
              <span className="text-stone-500">Nothing for what you don&apos;t.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-[640px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              Pay-as-you-go with a generous free band on every meter. No flat tiers, no minimums, no surprise cliffs — the same per-unit rate from your first GB to your millionth.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* Calculator */}
      <section className="bg-cream pt-12 pb-24 md:pb-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="Estimate your bill" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Pick a project shape.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Industry-average usage for each project shape, computed live against our catalog. Toggle the knowledge layer to see how RAG affects the bill.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-10">
              <PricingCalculator />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Meter price sheet */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Price sheet" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Every meter, every rate.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Seven metered resources. Same rate at every scale. Edit your subscription anytime — there's no commitment, no minimum spend, no migration cost between &quot;plans.&quot;
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Meters · per project, per month
                </span>
                <span className="font-mono text-[11px] text-stone-600">
                  no minimum · cancel anytime
                </span>
              </div>
              <div className="hidden grid-cols-[1.5fr_1fr_1fr] items-center gap-4 border-b border-stone-200/60 bg-stone-50/40 px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500 md:grid">
                <span>Resource</span>
                <span className="text-right">Free band</span>
                <span className="text-right">Then</span>
              </div>
              <ul className="divide-y divide-stone-200/60">
                {METERS.map((m) => (
                  <li
                    key={m.name}
                    className="grid grid-cols-1 items-baseline gap-2 px-5 py-4 md:grid-cols-[1.5fr_1fr_1fr] md:gap-4"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[14px] font-medium text-ink">{m.name}</span>
                      <span className="text-[12px] leading-[1.4] text-stone-500">
                        {m.description}
                      </span>
                    </div>
                    <div className="flex justify-between md:flex-col md:items-end md:gap-0">
                      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500 md:hidden">
                        Free
                      </span>
                      <span className="font-mono tabular-nums text-[14px] text-krater md:text-[15px]">
                        {m.free}
                      </span>
                      <span className="hidden font-mono text-[11px] text-stone-500 md:block">
                        {m.freeUnit}
                      </span>
                    </div>
                    <div className="flex justify-between md:flex-col md:items-end md:gap-0">
                      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500 md:hidden">
                        Then
                      </span>
                      <span className="font-mono tabular-nums text-[14px] text-ink md:text-[15px]">
                        {m.rate}
                      </span>
                      <span className="hidden font-mono text-[11px] text-stone-500 md:block">
                        {m.rateUnit}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Egress benchmark */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Benchmark" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                The honest math.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
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
              <NumberedEyebrow n="04" label="FAQ" />
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
          { icon: BarChart3, label: "Cost calculator", detail: "Estimate by project shape — Hobby to Production.", href: "#" },
          { icon: BookOpen, label: "Read the docs", detail: "Same S3 API, same commands.", href: "/docs" },
          { icon: MessageCircle, label: "Talk to us", detail: "Volume pricing, custom regions, beta access.", href: "mailto:hello@kraterion.com" },
        ]}
      />
    </>
  );
}
