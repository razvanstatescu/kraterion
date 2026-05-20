/**
 * 7-day trend sparkline. Tiny SVG, no axes, no labels — the meter
 * table already shows the totals. The line just gives a sense of
 * "trending up, flat, or down" at a glance.
 *
 * Renders a polyline with a soft tint underneath (subtle area fill,
 * Krater accent at 12% opacity). Zero-value runs render as a flat
 * line at the baseline so empty series don't disappear.
 *
 * Width is flexible (caller sets via CSS); height is fixed at 24px
 * so it tucks neatly into a table row.
 */
interface Props {
  /** 1-N data points (typically 7 for a week). Smallest non-negative
   *  values; we normalize to the local max internally. */
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  ariaLabel?: string;
}

export function Sparkline({
  values,
  width = 80,
  height = 24,
  color = "var(--krater)",
  ariaLabel,
}: Props) {
  if (values.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        aria-hidden
        focusable="false"
      />
    );
  }
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => {
      const x =
        values.length === 1
          ? width / 2
          : (i / (values.length - 1)) * (width - 2) + 1;
      const y = height - 2 - (v / max) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPts =
    `1,${height - 1} ` + pts + ` ${width - 1},${height - 1}`;
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={ariaLabel ?? "Trend"}
      focusable="false"
      style={{ display: "block" }}
    >
      <polyline
        points={areaPts}
        fill={color}
        opacity={0.12}
        stroke="none"
      />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
