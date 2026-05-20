import { cn } from "@/lib/cn";

export function NumberedEyebrow({
  n,
  label,
  tone = "cream",
  className,
}: {
  n: string;
  label: string;
  tone?: "cream" | "ink";
  className?: string;
}) {
  const dark = tone === "ink";
  return (
    <div className={cn("inline-flex items-baseline gap-3", className)}>
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums",
          dark ? "text-krater" : "text-krater"
        )}
      >
        {n}
      </span>
      <span
        className={cn(
          "text-[11px] uppercase tracking-[0.16em] font-medium",
          dark ? "text-stone-400" : "text-stone-500"
        )}
      >
        {label}
      </span>
    </div>
  );
}
