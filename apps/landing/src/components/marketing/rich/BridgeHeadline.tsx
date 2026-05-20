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
        "py-32 md:py-40",
        dark ? "bg-ink text-cream" : "bg-cream text-ink",
        className
      )}
    >
      <div className="mx-auto max-w-[1280px] px-6">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -10% 0px" }}
          transition={{ duration: 0.52, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "mx-auto max-w-[860px] text-[32px] leading-[1.1] tracking-[-0.02em] md:text-[56px]",
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
