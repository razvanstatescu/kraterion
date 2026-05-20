import { METER_COLORS, METER_LABELS, METER_STACK_ORDER } from "./meter-colors";

/**
 * Compact legend chip strip for the stacked daily bar.
 *
 * Only renders meters that have ever appeared in the period — the
 * caller passes the set of "seen" meter names so we don't show a
 * legend entry for share-token egress when the project doesn't use
 * share tokens.
 *
 * Sentence case, hairline borders, no shadow — matches the rest of
 * the design system.
 */
interface Props {
  seenMeters: Set<string>;
}

export function ChartLegend({ seenMeters }: Props) {
  const items = METER_STACK_ORDER.filter((m) => seenMeters.has(m));
  if (items.length === 0) return null;
  return (
    <div
      role="list"
      aria-label="Meter legend"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 16px",
        padding: "4px 0 0",
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
    >
      {items.map((m) => (
        <div
          key={m}
          role="listitem"
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: METER_COLORS[m] ?? "var(--stone-400)",
            }}
          />
          <span>{METER_LABELS[m] ?? m}</span>
        </div>
      ))}
    </div>
  );
}
