import { FadeUp } from "@/components/motion/FadeUp";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { ApertureHeroLazy } from "./ApertureHeroLazy";

export function Hero() {
  return (
    <section className="relative isolate flex min-h-[100vh] items-center overflow-hidden bg-cream pt-20">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <h1 className="text-[40px] leading-[1.05] tracking-[-0.02em] text-ink md:text-[72px]">
            <Reveal text="Object storage you actually own." />
          </h1>
          <FadeUp delay={0.4}>
            <p className="mt-8 max-w-[520px] text-[18px] leading-[1.55] text-stone-700">
              One bucket. S3-compatible. Searchable. Agent-ready. Embeddable. Bring the tools you already use; leave whenever you want.
            </p>
          </FadeUp>
          <FadeUp delay={0.5}>
            <div className="mt-10 flex items-center gap-6">
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
          <FadeUp delay={0.6}>
            <div className="mt-12 flex items-center gap-6">
              <span className="micro text-stone-500">S3 API</span>
              <span aria-hidden className="h-px w-6 bg-stone-300" />
              <span className="micro text-stone-500">Knowledge layer</span>
              <span aria-hidden className="h-px w-6 bg-stone-300" />
              <span className="micro text-stone-500">Agents</span>
            </div>
          </FadeUp>
        </div>

        <div className="flex items-center justify-center">
          <ApertureHeroLazy />
        </div>
      </div>
    </section>
  );
}
