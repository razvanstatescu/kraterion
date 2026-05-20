import { cn } from "@/lib/cn";
import { KraterionMark } from "./KraterionMark";

export function KraterionWordmark({
  as: As = "span",
  variant = "light",
  size = 22,
  className,
}: {
  as?: "h1" | "span" | "div";
  variant?: "light" | "dark";
  size?: number;
  className?: string;
}) {
  return (
    <As
      className={cn(
        "inline-flex items-center gap-[10px] text-[15px] font-medium",
        variant === "dark" ? "text-cream" : "text-ink",
        className
      )}
      style={{ letterSpacing: "0.06em" }}
    >
      <KraterionMark variant={variant} size={size} />
      <span>Kraterion</span>
    </As>
  );
}
