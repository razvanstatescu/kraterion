import { cn } from "@/lib/cn";
import { FadeUp } from "@/components/motion/FadeUp";

export function SectionFrame({
  eyebrow,
  headline,
  lede,
  tone = "cream",
  align = "left",
  children,
  className,
  id,
}: {
  eyebrow?: string;
  headline?: React.ReactNode;
  lede?: React.ReactNode;
  tone?: "cream" | "ink";
  align?: "left" | "center";
  children?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const dark = tone === "ink";
  return (
    <section
      id={id}
      className={cn(
        "w-full",
        dark ? "bg-ink text-cream" : "bg-cream text-ink",
        className
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-[1280px] px-6 py-24 md:py-32",
          align === "center" ? "text-center" : ""
        )}
      >
        {(eyebrow || headline || lede) && (
          <div className={cn(align === "center" ? "mx-auto max-w-[760px]" : "max-w-[760px]")}>
            {eyebrow && (
              <FadeUp>
                <p className={cn("micro", dark ? "text-stone-400" : "text-stone-500")}>
                  {eyebrow}
                </p>
              </FadeUp>
            )}
            {headline && (
              <FadeUp delay={0.05}>
                <h2
                  className={cn(
                    "mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]",
                    dark ? "text-cream" : "text-ink"
                  )}
                >
                  {headline}
                </h2>
              </FadeUp>
            )}
            {lede && (
              <FadeUp delay={0.1}>
                <p
                  className={cn(
                    "mt-6 text-[18px] leading-[1.5]",
                    dark ? "text-stone-300" : "text-stone-700"
                  )}
                >
                  {lede}
                </p>
              </FadeUp>
            )}
          </div>
        )}
        {children && <div className={cn(eyebrow || headline || lede ? "mt-16" : "")}>{children}</div>}
      </div>
    </section>
  );
}
