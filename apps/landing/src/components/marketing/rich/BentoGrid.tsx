import { cn } from "@/lib/cn";
import { FadeUp } from "@/components/motion/FadeUp";

type Span = "1x1" | "2x1" | "1x2" | "2x2";

export function BentoGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60",
        "auto-rows-[280px] md:auto-rows-[300px]",
        "grid-cols-1 md:grid-cols-3",
        className
      )}
    >
      {children}
    </div>
  );
}

export function BentoTile({
  span = "1x1",
  tone = "cream",
  className,
  children,
  delay = 0,
}: {
  span?: Span;
  tone?: "cream" | "ink";
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  const dark = tone === "ink";
  const spanMap: Record<Span, string> = {
    "1x1": "",
    "2x1": "md:col-span-2",
    "1x2": "md:row-span-2",
    "2x2": "md:col-span-2 md:row-span-2",
  };
  return (
    <FadeUp
      delay={delay}
      className={cn(
        "relative flex h-full flex-col overflow-hidden",
        dark ? "bg-ink text-cream" : "bg-cream text-ink",
        spanMap[span],
        className
      )}
    >
      {children}
    </FadeUp>
  );
}

export function BentoBody({
  eyebrow,
  title,
  lede,
  tone = "cream",
  className,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  tone?: "cream" | "ink";
  className?: string;
}) {
  const dark = tone === "ink";
  return (
    <div className={cn("flex flex-col gap-2 p-6 md:p-8", className)}>
      {eyebrow && (
        <span
          className={cn(
            "text-[11px] uppercase tracking-[0.16em] font-medium",
            dark ? "text-stone-400" : "text-stone-500"
          )}
        >
          {eyebrow}
        </span>
      )}
      <h3 className={cn("text-[20px] leading-[1.2] md:text-[24px]", dark ? "text-cream" : "text-ink")}>
        {title}
      </h3>
      {lede && (
        <p className={cn("text-[14px] leading-[1.55]", dark ? "text-stone-300" : "text-stone-700")}>
          {lede}
        </p>
      )}
    </div>
  );
}
