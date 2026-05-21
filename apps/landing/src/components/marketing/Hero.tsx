import { FadeUp } from "@/components/motion/FadeUp";
import { Reveal } from "@/components/motion/Reveal";
import { WordCycle } from "@/components/motion/WordCycle";
import { ButtonLink } from "@/components/ui/Button";
import { HeroVisual } from "./HeroVisual";

const HEADLINE_CYCLE = [
  "humans and agents.",
  "the tools you use.",
  "data you actually own.",
  "what comes next.",
];

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        <div className="relative z-10">
          <FadeUp>
            <div className="inline-flex items-center gap-2 rounded-full border border-stone-200/60 bg-cream px-3 py-1 text-[12px] text-stone-700">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-krater" />
              v 0.1 · private beta
            </div>
          </FadeUp>

          <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
            <Reveal text="Smart object storage." />
            <br />
            <FadeUp as="span" delay={0.55} className="text-stone-500">
              Built for{" "}
              <WordCycle
                words={HEADLINE_CYCLE}
                startDelayMs={1400}
                intervalMs={2800}
                durationMs={560}
              />
            </FadeUp>
          </h1>
          <FadeUp delay={0.45}>
            <p className="mt-6 max-w-[520px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              S3-compatible buckets that index themselves, answer with citations, and stay yours when you walk away.
            </p>
          </FadeUp>
          <FadeUp delay={0.55}>
            <div className="mt-8 flex items-center gap-6">
              <ButtonLink href="/signup" variant="primary" size="lg">
                Start free →
              </ButtonLink>
              <a
                href="/docs"
                className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
              >
                Read the docs
              </a>
            </div>
          </FadeUp>
          <FadeUp delay={0.65}>
            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">S3 API</span>
              <span aria-hidden className="h-px w-6 bg-stone-300" />
              <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">Knowledge layer</span>
              <span aria-hidden className="h-px w-6 bg-stone-300" />
              <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">Agents</span>
            </div>
          </FadeUp>
        </div>

        {/* Right column — composite product slice that tells the 3-layer story.
            Block layout (not flex) + explicit max-width on the wrapper so the
            visual has a stable, content-independent width. */}
        <div className="relative">
          <FadeUp delay={0.35} className="mx-auto w-full max-w-[520px]">
            <HeroVisual className="w-full" />
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
