import { cn } from "@/lib/cn";

export function Pill({
  tone = "stone",
  children,
  className,
}: {
  tone?: "stone" | "success" | "krater" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const toneClass = {
    stone: "bg-stone-100 text-stone-700",
    success: "bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]",
    krater: "bg-krater/10 text-krater",
    info: "bg-[color:var(--color-info)]/10 text-[color:var(--color-info)]",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-medium",
        "uppercase tracking-[0.16em]",
        toneClass,
        className
      )}
    >
      {children}
    </span>
  );
}
