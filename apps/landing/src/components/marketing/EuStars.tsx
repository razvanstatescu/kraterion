/**
 * EuStars — a ring of 12 dots evoking the EU emblem, drawn in currentColor.
 * A subtle, non-trademarked motif for EU-origin regulations (AI Act, GDPR).
 */
export function EuStars({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const c = size / 2;
  const r = size / 2 - size * 0.08;
  const dot = size * 0.045;
  const dots = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI - Math.PI / 2;
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      aria-hidden
      fill="currentColor"
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={dot} />
      ))}
    </svg>
  );
}
