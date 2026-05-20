import { cn } from "@/lib/cn";

export function MetricCard({
  value,
  label,
  hint,
  accent = false,
  className,
}: {
  value: string;
  label: string;
  hint?: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-stone-200/60 bg-cream p-5",
        className
      )}
    >
      <div
        className={cn(
          "font-medium leading-none tracking-[-0.01em] tabular-nums text-[40px]",
          accent ? "text-krater" : "text-ink"
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[13px] font-medium text-stone-700">{label}</div>
      {hint && (
        <div className="mt-1 text-[11px] uppercase tracking-[0.12em] font-mono text-stone-500">
          {hint}
        </div>
      )}
    </div>
  );
}
