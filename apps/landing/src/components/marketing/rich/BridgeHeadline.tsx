import * as motion from "motion/react-client";
import { cn } from "@/lib/cn";

export function BridgeHeadline({
  children,
  tone = "cream",
  align = "center",
  className,
}: {
  children: React.ReactNode;
  tone?: "cream" | "ink";
  align?: "left" | "center";
  className?: string;
}) {
  const dark = tone === "ink";
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden py-28 md:py-36",
        dark ? "bg-ink text-cream" : "bg-cream text-ink",
        className
      )}
    >
      {/* Background — soft radial wash + hairline grid */}
      <BridgeBackdrop dark={dark} />

      {/* Top + bottom hairline rules — give the bridge real edges */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px",
          dark ? "bg-stone-800" : "bg-stone-200/80"
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-px",
          dark ? "bg-stone-800" : "bg-stone-200/80"
        )}
      />

      <div className="relative mx-auto max-w-[1280px] px-6">
        {/* Eyebrow chip — provides anchor + reference scale */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "flex items-center gap-3",
            align === "center" ? "justify-center" : "justify-start"
          )}
        >
          <span
            aria-hidden
            className={cn(
              "h-px w-8",
              dark ? "bg-stone-700" : "bg-stone-300"
            )}
          />
          <span
            className={cn(
              "inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-medium",
              dark ? "text-stone-400" : "text-stone-500"
            )}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-krater"
            />
            Bridge
          </span>
          <span
            aria-hidden
            className={cn(
              "h-px w-8",
              dark ? "bg-stone-700" : "bg-stone-300"
            )}
          />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "mx-auto mt-8 max-w-[860px] text-[32px] leading-[1.1] tracking-[-0.02em] md:text-[56px]",
            align === "center" ? "text-center" : "text-left",
            dark ? "text-cream" : "text-ink"
          )}
        >
          {children}
        </motion.h2>
      </div>
    </section>
  );
}

function BridgeBackdrop({ dark }: { dark: boolean }) {
  const grid = dark ? "rgba(168, 156, 130, 0.08)" : "rgba(124, 113, 88, 0.06)";
  const wash = dark
    ? "radial-gradient(60% 80% at 50% 50%, rgba(196,91,54,0.10) 0%, rgba(196,91,54,0) 70%)"
    : "radial-gradient(60% 80% at 50% 50%, rgba(196,91,54,0.06) 0%, rgba(196,91,54,0) 70%)";
  return (
    <>
      {/* Soft Krater wash centered behind the headline */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: wash }}
      />
      {/* Hairline grid — subtle CAD-style reference */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage: `linear-gradient(to right, ${grid} 1px, transparent 1px), linear-gradient(to bottom, ${grid} 1px, transparent 1px)`,
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(60% 80% at 50% 50%, black 0%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(60% 80% at 50% 50%, black 0%, transparent 75%)",
        }}
      />
    </>
  );
}
