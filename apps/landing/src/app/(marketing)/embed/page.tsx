import type { Metadata } from "next";
import { Lock, Globe, Gauge, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { EmbedSiteDemo } from "@/components/marketing/EmbedSiteDemo";
import { TokenRotation } from "@/components/marketing/visuals/TokenRotation";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { BookOpen, ScrollText } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Embed widget — Kraterion",
  description:
    "Drop a chat on any site. One line. Origin-locked share tokens, per-token rate limits.",
};

const SNIPPET_TABS = [
  {
    lang: "html",
    filename: "index.html",
    code: `<script src="https://embed.kraterion.com/v1.js"
        data-token="pk_share_..."
        data-theme="light"
        data-position="bottom-right"
        defer></script>`,
  },
  {
    lang: "html",
    filename: "react.tsx",
    code: `import { useEffect } from "react";

export function KraterionChat() {
  useEffect(() => {
    const s = document.createElement("script");
    s.src = "https://embed.kraterion.com/v1.js";
    s.dataset.token = process.env.NEXT_PUBLIC_KRATERION_SHARE!;
    s.defer = true;
    document.body.appendChild(s);
    return () => { document.body.removeChild(s); };
  }, []);
  return null;
}`,
  },
];

const EMBED_STATS = [
  { value: "1", label: "script tag, that's it", sub: "No bundler. No iframe." },
  { value: "9 KB", label: "gzipped", sub: "Code-split, lazy" },
  { value: "0 ms", label: "blocking", sub: "Defer-loaded" },
  { value: "0", label: "data leaves the bucket", sub: "Only the answer ships" },
];

export default function Page() {
  return (
    <>
      {/* Hero — fake site preview */}
      <section className="relative overflow-hidden bg-cream pt-40 pb-16">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[860px]">
              <NumberedEyebrow n="EW" label="Embed widget" />
              <h1 className="mt-6 text-[44px] leading-[1.05] tracking-[-0.02em] md:text-[80px]">
                Drop a chat
                <br />
                <span className="text-stone-500">on any site. One line.</span>
              </h1>
              <p className="mt-8 max-w-[640px] text-[18px] text-stone-700">
                Issue a share token. Paste the script tag. Your customers can ask questions; we bind answers to citations from the bucket you connect.
              </p>
              <div className="mt-10 flex items-center gap-6">
                <ButtonLink href="mailto:hello@kraterion.com?subject=Beta%20access%20request" variant="primary" size="lg">Get early access →</ButtonLink>
                <a href="/docs" className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
                  Embed docs
                </a>
              </div>
            </div>
          </FadeUp>
          <FadeUp delay={0.2}>
            <div className="mt-16">
              <EmbedSiteDemo />
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={EMBED_STATS} />
        </div>
      </section>

      {/* One line */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="One line" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Paste it. Ship it.
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <CodeBlock tabs={SNIPPET_TABS} />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Token model */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Share tokens" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Public tokens you can rotate.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] text-stone-700">
                Each token is scoped to one bucket, one origin, and one quota. Rotate any time without redeploying.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
            <Card
              icon={Globe}
              eyebrow="01"
              title="Origin-locked"
              detail="Tokens only work from origins you allow-list. Stolen tokens fail elsewhere."
            />
            <Card
              icon={Lock}
              eyebrow="02"
              title="Read-only"
              detail="Public tokens can read indexed answers — never your raw files."
            />
            <Card
              icon={Gauge}
              eyebrow="03"
              title="Per-token quotas"
              detail="Cap requests per minute, per day, per token. Predictable cost ceilings."
            />
          </div>
        </div>
      </section>

      {/* Token policy mock */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Token policy" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Allowed. Capped. Visible.
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <TokenRotation />
            </div>
          </FadeUp>
          <FadeUp delay={0.15}>
            <div className="mt-8 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
                <span className="font-mono text-[12px] text-stone-700">pk_share_3f4d…01ab</span>
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Active
                </span>
              </div>
              <PolicyRow label="Bucket" value="support-docs" />
              <PolicyRow label="Origin allowlist" value="acme-co.com, docs.acme-co.com" />
              <PolicyRow label="Rate limit" value="60 req / minute" />
              <PolicyRow label="Daily cap" value="10,000 req / day" />
              <PolicyRow label="Issued" value="2026-05-12" />
              <PolicyRow label="Last used" value="just now" highlight />
            </div>
          </FadeUp>
        </div>
      </section>

      <BridgeHeadline tone="ink">
        The bytes never leave your bucket.
        <br />
        <span className="text-stone-500">Only the answer ships.</span>
      </BridgeHeadline>

      <PremiumCTA
        eyebrow="Ship in minutes"
        headline={
          <>
            Chat on your site
            <br />
            <span className="text-stone-500">in 30 seconds.</span>
          </>
        }
        sub="One script tag. Origin-locked share tokens. Per-token rate limits."
        satellites={[
          { icon: BookOpen, label: "Embed docs", detail: "Configuration, theming, share tokens.", href: "/docs" },
          { icon: ScrollText, label: "Pricing", detail: "Pro and Scale include the widget.", href: "/pricing" },
        ]}
      />
    </>
  );
}

function Card({
  icon: Icon,
  eyebrow,
  title,
  detail,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <FadeUp className="bg-cream p-8">
      <div className="flex items-center justify-between">
        <Icon size={20} strokeWidth={1.5} className="text-ink" />
        <span className="font-mono text-[12px] tabular-nums text-krater">{eyebrow}</span>
      </div>
      <div className="mt-6 text-[20px] font-medium text-ink">{title}</div>
      <p className="mt-3 text-[14px] leading-[1.6] text-stone-700">{detail}</p>
    </FadeUp>
  );
}

function PolicyRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-4 border-b border-stone-200/60 px-4 py-3 last:border-b-0">
      <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">{label}</span>
      <span className={`font-mono text-[13px] ${highlight ? "text-krater" : "text-ink"}`}>{value}</span>
    </div>
  );
}
