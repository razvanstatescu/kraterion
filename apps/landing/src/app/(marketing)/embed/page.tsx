import type { Metadata } from "next";
import { Lock, Globe, Gauge, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { EmbedSiteDemo } from "@/components/marketing/EmbedSiteDemo";
import { KraterionChatWidget } from "@/components/marketing/KraterionChatWidget";
import { CornerTicks } from "@/components/marketing/visuals/CornerTicks";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { BookOpen, ScrollText } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Embed widget — Kraterion",
  description:
    "Drop a chat on any site. One script tag. Origin-locked share tokens, per-token rate limits, sealed buckets behind the answer.",
};

const SNIPPET_TABS = [
  {
    lang: "html",
    filename: "index.html",
    code: `<script src="https://embed.kraterion.com/v1.js"
        data-token="kr_share_test_..."
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
  { value: "1", label: "Script tag, that's it", sub: "No bundler. No iframe." },
  { value: "9 KB", label: "Gzipped", sub: "Code-split, lazy" },
  { value: "0 ms", label: "Blocking", sub: "Defer-loaded" },
  { value: "0", label: "Raw bytes leave", sub: "Only the cited answer ships" },
];

export default function Page() {
  return (
    <>
      {/* Hero — clean split: copy left, widget alone right */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <div>
            <FadeUp>
              <NumberedEyebrow n="EW" label="Embed widget" />
              <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
                Drop a chat
                <br />
                <span className="text-stone-500">on any site. One line.</span>
              </h1>
              <p className="mt-6 max-w-[540px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
                Issue a share token. Paste the script tag. Your customers can ask questions; the agent answers with citations from the bucket you connect — never the raw bytes.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <ButtonLink
                  href="https://app.kraterion.com/login"
                  variant="primary"
                  size="lg"
                >
                  Try Kraterion →
                </ButtonLink>
                <a
                  href="/docs"
                  className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
                >
                  Embed docs
                </a>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Origin-locked
                </span>
                <span aria-hidden className="h-px w-6 bg-stone-300" />
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Per-token caps
                </span>
                <span aria-hidden className="h-px w-6 bg-stone-300" />
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Cited answers
                </span>
              </div>
            </FadeUp>
          </div>

          {/* Right column — just the widget, generous space around it */}
          <div className="relative">
            <FadeUp delay={0.35} className="mx-auto w-full max-w-[420px]">
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Live preview
                </span>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-stone-500">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)] animate-[pulse_1.6s_ease-in-out_infinite]"
                  />
                  acme-co.com / docs
                </span>
              </div>
              <div className="relative px-4 pb-6 pt-2">
                <CornerTicks color="#A89C82" size={12} inset={-4} />
                {/* Subtle page-content skeleton behind the widget — fills
                    the negative space when the chat is closed so the area
                    reads as "this is the page the widget sits on". */}
                <FakePageSkeleton />
                <div className="relative z-10">
                  <KraterionChatWidget mode="demo" theme="light" />
                </div>
              </div>
            </FadeUp>
          </div>
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
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Paste it. Ship it.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                The widget loads <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">defer</code>, code-split into a ~9 KB gzipped bundle, and never blocks your render path.
              </p>
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
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Public tokens you can rotate.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Every share token is scoped to one agent, one bucket, one origin allowlist, and a daily request cap. Tokens use the <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">kr_share_test_</code> / <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">kr_share_live_</code> prefix — distinct from your bearer keys so the auth guard can route them separately.
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
              detail="Public tokens can read cited answers — never your raw files. Only the agent's response ships."
            />
            <Card
              icon={Gauge}
              eyebrow="03"
              title="Per-token caps"
              detail="Cap requests per minute, per day, per token. Predictable cost ceilings, abuse-resistant by design."
            />
          </div>
        </div>
      </section>

      {/* Token policy mock — real prefix format */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Token policy" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Allowed. Capped. Visible.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Each token's policy is editable from the dashboard and visible in your audit log. Rotate any time without redeploying — the script tag stays the same, you swap the token value.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
                <span className="font-mono text-[12px] text-stone-700">
                  kr_share_test_3f4d…01ab
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] font-medium text-[color:var(--color-success)]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]" />
                  Active
                </span>
              </div>
              <PolicyRow label="Scope" value="support-agent · bucket support-docs" />
              <PolicyRow label="Origin allowlist" value="acme-co.com, docs.acme-co.com" />
              <PolicyRow label="Rate limit" value="60 req / minute" />
              <PolicyRow label="Daily cap" value="10,000 req / day" />
              <PolicyRow label="Issued" value="2026-05-12" />
              <PolicyRow label="Last used" value="just now" highlight />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Customize & preview — full-site demo with theme/position controls */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Customize & preview" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                See it on a real-shape page.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Theme it. Position it. Watch it sit on a real-shape page — same layout your customers will see. Theme and placement are token-level settings; rotate the token and the widget reconfigures without a redeploy.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <EmbedSiteDemo />
            </div>
          </FadeUp>
        </div>
      </section>

      <BridgeHeadline tone="ink">
        The bytes never leave your bucket.
        <br />
        <span className="text-stone-500">Only the cited answer ships.</span>
      </BridgeHeadline>

      <PremiumCTA
        eyebrow="Ship in minutes"
        headline={
          <>
            Chat on your site.
            <br />
            <span className="text-stone-500">One script tag.</span>
          </>
        }
        primaryHref="https://app.kraterion.com/login"
        primaryLabel="Try Kraterion →"
        sub="Origin-locked share tokens. Per-token rate limits. Cited answers, never raw files."
        satellites={[
          { icon: BookOpen, label: "Embed docs", detail: "Configuration, theming, share tokens.", href: "/docs" },
          { icon: ScrollText, label: "Pricing", detail: "Public-link bandwidth $0.01/GB · cited answers only.", href: "/pricing" },
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

function PolicyRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-4 border-b border-stone-200/60 px-4 py-3 last:border-b-0">
      <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span
        className={`font-mono text-[13px] ${highlight ? "text-krater" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Fake page skeleton (behind the chat widget) ───────────────── */

/**
 * Subtle page-content skeleton rendered behind the chat widget in the
 * hero. When the widget is closed (only the bubble visible), this fills
 * the negative space so the area reads as "a page that the widget sits
 * on" rather than empty white space. Low-opacity stone tones — never
 * compete with the widget for attention.
 */
function FakePageSkeleton() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-2 z-0 px-2"
    >
      {/* Eyebrow */}
      <div className="h-2 w-14 rounded-sm bg-stone-300/45" />

      {/* Title (2 lines) */}
      <div className="mt-3 space-y-1.5">
        <div className="h-3.5 w-[78%] rounded-sm bg-stone-300/55" />
        <div className="h-3.5 w-[52%] rounded-sm bg-stone-300/55" />
      </div>

      {/* Body paragraph */}
      <div className="mt-5 space-y-1.5">
        <div className="h-2 w-full rounded-sm bg-stone-200/60" />
        <div className="h-2 w-[92%] rounded-sm bg-stone-200/60" />
        <div className="h-2 w-[78%] rounded-sm bg-stone-200/60" />
        <div className="h-2 w-[86%] rounded-sm bg-stone-200/60" />
        <div className="h-2 w-[64%] rounded-sm bg-stone-200/60" />
      </div>

      {/* Inline "code-ish" card */}
      <div className="mt-5 rounded-md border border-stone-200/40 bg-stone-100/30 p-3">
        <div className="h-2 w-28 rounded-sm bg-stone-300/40" />
        <div className="mt-1.5 h-2 w-20 rounded-sm bg-stone-300/40" />
      </div>

      {/* Another short paragraph */}
      <div className="mt-5 space-y-1.5">
        <div className="h-2 w-[88%] rounded-sm bg-stone-200/60" />
        <div className="h-2 w-[72%] rounded-sm bg-stone-200/60" />
      </div>
    </div>
  );
}
