"use client";

import { cn } from "@/lib/cn";

export function LogoMarquee({
  logos,
  className,
}: {
  logos: string[];
  className?: string;
}) {
  // Double the array so the loop is seamless.
  const sequence = [...logos, ...logos];
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        // Soft fade on both edges via mask
        "[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]",
        className
      )}
      aria-label="Companies using Kraterion"
    >
      <div
        className="flex w-max items-center gap-16 py-2"
        style={{
          animation: "marquee 38s linear infinite",
        }}
      >
        {sequence.map((label, i) => (
          <span
            key={i}
            className="shrink-0 text-[18px] font-medium tracking-[0.04em] text-stone-500"
          >
            {label}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
