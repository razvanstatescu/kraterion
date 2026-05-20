import { cn } from "@/lib/cn";

type Variant = "light" | "dark" | "on-krater" | "mono";

const palettes: Record<Variant, { outer: string; middle: string; dot: string }> = {
  light: { outer: "#7C7158", middle: "#403930", dot: "#1A1610" },
  dark: { outer: "#7C7158", middle: "#F8F4EC", dot: "#C45B36" },
  "on-krater": { outer: "#F8F4EC", middle: "#F8F4EC", dot: "#F8F4EC" },
  mono: { outer: "currentColor", middle: "currentColor", dot: "currentColor" },
};

export function KraterionMark({
  variant = "light",
  size = 24,
  className,
  "aria-hidden": ariaHidden = true,
  title,
}: {
  variant?: Variant;
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
  title?: string;
}) {
  const { outer, middle, dot } = palettes[variant];
  return (
    <svg
      className={cn(className)}
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden={ariaHidden}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="128" cy="128" r="110" fill="none" stroke={outer} strokeWidth="10" />
      <circle cx="128" cy="128" r="68" fill="none" stroke={middle} strokeWidth="10" />
      <circle cx="128" cy="128" r="22" fill={dot} />
    </svg>
  );
}
