import type { Metadata } from "next";
import { Lock, Globe, Gauge, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { SectionFrame } from "@/components/marketing/SectionFrame";
import { KraterionChatWidget } from "@/components/marketing/KraterionChatWidget";

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

export default function Page() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream pt-40 pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.2fr_0.8fr]">
          <FadeUp>
            <p className="micro text-stone-500">Embed widget</p>
            <h1 className="mt-4 max-w-[680px] text-[40px] leading-[1.05] tracking-[-0.02em] md:text-[64px]">
              Drop a chat on any site. One line.
            </h1>
            <p className="mt-8 max-w-[560px] text-[18px] text-stone-700">
              Issue a share token. Paste the script tag. Your customers can ask questions; we bind answers to citations from the bucket you connect.
            </p>
            <div className="mt-10 flex items-center gap-6">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free →</ButtonLink>
              <a href="/docs" className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
                Embed docs
              </a>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="flex justify-end">
              <KraterionChatWidget mode="demo" theme="light" />
            </div>
          </FadeUp>
        </div>
      </section>

      <SectionFrame
        eyebrow="One line"
        headline="Paste it. Ship it."
      >
        <CodeBlock tabs={SNIPPET_TABS} />
      </SectionFrame>

      <SectionFrame
        eyebrow="Share tokens"
        headline="Public tokens you can rotate."
        lede="Each token is scoped to one bucket, one origin, and one quota. Rotate any time without redeploying."
      >
        <div className="grid gap-6 md:grid-cols-3">
          <Card icon={Globe} title="Origin-locked" detail="Tokens only work from origins you allow-list. Stolen tokens fail elsewhere." />
          <Card icon={Lock} title="Read-only" detail="Public tokens can read indexed answers — never your raw files." />
          <Card icon={Gauge} title="Per-token quotas" detail="Cap requests per minute, per day, per token. Predictable cost ceilings." />
        </div>
      </SectionFrame>

      <SectionFrame
        tone="ink"
        eyebrow="Security"
        headline="The bytes never leave your bucket."
        lede="Indexed content stays on Kraterion's side. The widget only sees the rendered answer and its citation chips."
      />

      <section className="bg-cream">
        <div className="mx-auto max-w-[1280px] px-6 py-32 text-center">
          <FadeUp>
            <h2 className="mx-auto max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
              Add chat to your site in 30 seconds.
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

function Card({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <FadeUp className="rounded-lg border border-stone-200/60 bg-cream p-6">
      <Icon size={20} strokeWidth={1.5} className="text-ink" />
      <div className="mt-4 text-[18px] font-medium text-ink">{title}</div>
      <p className="mt-2 text-[14px] text-stone-700">{detail}</p>
    </FadeUp>
  );
}
