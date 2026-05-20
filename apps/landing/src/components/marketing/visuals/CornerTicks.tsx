import { cn } from "@/lib/cn";

/**
 * Four small L-shaped registration ticks at the corners of a relatively-
 * positioned parent. Reads like a CAD drawing — premium without ornament.
 */
export function CornerTicks({
  className,
  color = "#A89C82",
  size = 10,
  inset = -8,
}: {
  className?: string;
  color?: string;
  size?: number;
  inset?: number;
}) {
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {/* top-left */}
      <span
        className="absolute"
        style={{
          top: inset,
          left: inset,
          width: size,
          height: size,
          borderTop: `1px solid ${color}`,
          borderLeft: `1px solid ${color}`,
        }}
      />
      {/* top-right */}
      <span
        className="absolute"
        style={{
          top: inset,
          right: inset,
          width: size,
          height: size,
          borderTop: `1px solid ${color}`,
          borderRight: `1px solid ${color}`,
        }}
      />
      {/* bottom-left */}
      <span
        className="absolute"
        style={{
          bottom: inset,
          left: inset,
          width: size,
          height: size,
          borderBottom: `1px solid ${color}`,
          borderLeft: `1px solid ${color}`,
        }}
      />
      {/* bottom-right */}
      <span
        className="absolute"
        style={{
          bottom: inset,
          right: inset,
          width: size,
          height: size,
          borderBottom: `1px solid ${color}`,
          borderRight: `1px solid ${color}`,
        }}
      />
    </span>
  );
}
