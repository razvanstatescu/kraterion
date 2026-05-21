import { FadeUp } from "@/components/motion/FadeUp";
import { Reveal } from "@/components/motion/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { CornerTicks } from "./visuals/CornerTicks";
import {
  DashboardChrome,
  FileRow,
  UsageBar,
} from "./rich/DashboardSlice";

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
            <span className="text-stone-500">
              <Reveal text="Built for humans and agents." delay={0.15} />
            </span>
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

        {/* Right column — layered dashboard slices */}
        <div className="relative flex items-center justify-center">
          <div className="relative w-full max-w-[480px]">
            <CornerTicks />
            <FadeUp delay={0.4}>
              <DashboardChrome url="app.kraterion.com" path="/buckets" className="hairline">
                <div className="bg-cream">
                  <FileRow icon="folder" name="assets-prod" size="24.6 GB" status="indexed" />
                  <FileRow icon="file" name="photo-final-v3.jpg" size="2.1 MB" status="sealed" />
                  <FileRow icon="file" name="report-q1.pdf" size="482 KB" status="encrypting" />
                  <FileRow icon="file" name="dataset-2026-05.parquet" size="118 MB" status="uploading" />
                </div>
              </DashboardChrome>
            </FadeUp>

            <FadeUp delay={0.7}>
              <div className="mt-3 ml-12 hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
                <UsageBar label="Storage used" value={64} max={1024} unit="GB" />
                <div className="border-t border-stone-200/60 px-4 py-3 text-[11px] font-mono">
                  <div className="flex justify-between text-stone-500">
                    <span>$0.00 egress</span>
                    <span>5,840 reads / 24h</span>
                  </div>
                </div>
              </div>
            </FadeUp>
          </div>
        </div>
      </div>
    </section>
  );
}
