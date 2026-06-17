import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { CornerTicks } from "./CornerTicks";
import { cn } from "@/lib/cn";

export type Satellite = {
  icon: LucideIcon;
  label: string;
  detail: string;
  href: string;
};

export function PremiumCTA({
  eyebrow = "Get started",
  headline,
  sub,
  primaryHref = "https://app.kraterion.com/login",
  primaryLabel = "Try Kraterion →",
  secondaryHref = "/docs",
  secondaryLabel = "Read the docs",
  satellites,
  buildTag = "v 0.1 · testnet",
  status = "All systems normal",
  className,
}: {
  eyebrow?: string;
  headline: React.ReactNode;
  sub?: React.ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  satellites?: Satellite[];
  buildTag?: string;
  status?: string;
  className?: string;
}) {
  return (
    <section className={cn("relative bg-cream py-20 md:py-24", className)}>
      <div className="mx-auto max-w-[1280px] px-6">
        {/* Inner panel */}
        <div
          className="relative mx-auto max-w-[1040px] rounded-[20px] border border-stone-200/80 px-8 py-12 md:px-14 md:py-14"
          style={{
            background: "rgba(196, 91, 54, 0.035)",
          }}
        >
          <CornerTicks color="#A89C82" size={12} inset={10} />

          {/* Eyebrow chip */}
          <div className="flex items-center justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-stone-200/80 bg-cream px-3 py-1 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-600">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-krater" />
              {eyebrow}
            </span>
          </div>

          {/* Headline */}
          <h2 className="mx-auto mt-5 max-w-[820px] text-center text-[36px] leading-[1.05] tracking-[-0.02em] md:text-[56px]">
            {headline}
          </h2>

          {sub && (
            <p className="mx-auto mt-5 max-w-[560px] text-center text-[16px] leading-[1.6] text-stone-700">
              {sub}
            </p>
          )}

          {/* CTAs */}
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-5">
            <ButtonLink href={primaryHref} variant="primary" size="lg">
              {primaryLabel}
            </ButtonLink>
            <Link
              href={secondaryHref}
              className="text-[15px] font-medium underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
            >
              {secondaryLabel}
            </Link>
          </div>

          {/* Bottom band — build tag · status */}
          <div className="mt-8 flex items-center justify-center gap-3 text-[11px]">
            <span className="font-mono uppercase tracking-[0.12em] text-stone-500">
              {buildTag}
            </span>
            <span aria-hidden className="text-stone-300">·</span>
            <span className="inline-flex items-center gap-1.5 text-stone-600">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: "#5C7A3F" }}
              />
              {status}
            </span>
          </div>
        </div>

        {/* Satellites */}
        {satellites && satellites.length > 0 && (
          <div className="mx-auto mt-6 grid max-w-[1040px] gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
            {satellites.map((s) => (
              <Link
                key={s.href}
                href={s.href}
                className="group flex items-start justify-between gap-4 bg-cream p-6 transition-colors hover:bg-stone-50"
              >
                <div className="flex items-start gap-3">
                  <s.icon size={18} strokeWidth={1.5} className="mt-0.5 text-stone-500" />
                  <div>
                    <div className="text-[14px] font-medium text-ink">{s.label}</div>
                    <div className="mt-1 text-[12px] text-stone-600">{s.detail}</div>
                  </div>
                </div>
                <ArrowRight
                  size={14}
                  strokeWidth={1.5}
                  className="mt-1 text-stone-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
