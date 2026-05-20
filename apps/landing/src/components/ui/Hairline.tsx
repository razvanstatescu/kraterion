import { cn } from "@/lib/cn";

export function Hairline({
  orientation = "h",
  className,
}: {
  orientation?: "h" | "v";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block bg-stone-200/60",
        orientation === "h" ? "h-px w-full" : "w-px h-full",
        className
      )}
    />
  );
}
