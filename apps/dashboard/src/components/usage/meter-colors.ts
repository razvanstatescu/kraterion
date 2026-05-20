/**
 * Stable per-meter color tokens for the stacked daily bar chart and
 * the sparklines. Picked from the kraterion-design stone + krater
 * palette so they read together as a single chart rather than a
 * rainbow.
 *
 * Design rules followed:
 *   - no pure black or white;
 *   - cool greys are banned, so the stack uses warm stone tones;
 *   - the Krater accent is reserved for the storage line (the
 *     biggest line on most accounts, so it earns the brand color).
 *
 * If you add a meter, append to this map AND extend the legend in
 * `StackedDailyBar.tsx`.
 */
export const METER_COLORS: Record<string, string> = {
  // Storage rollup (display-only on /usage; not a metered line, but
  // it's the dominant value in most stacks). Krater accent because
  // it's the brand surface and reads first.
  storage_used_bytes: "#C45B36", // var(--krater)
  // Metered surfaces. Warm earth tones so they read related, not
  // unrelated. Picked from the design system's stone scale +
  // hand-tuned to be visually distinct on a 6-bar stack.
  gateway_class_a: "#7C7158", // var(--stone-500) — neutral leader
  gateway_class_b: "#A89E80", // lighter stone
  gateway_egress_bytes: "#8B6F3F", // amber-warm
  share_token_egress_bytes: "#B89970", // muted gold
  kb_index_byte_seconds: "#5C654F", // sage
  agent_messages: "#7A4E55", // muted plum
};

/** Pretty label for the chart legend + tooltip. Mirrors what the
 *  meter table shows. */
export const METER_LABELS: Record<string, string> = {
  storage_used_bytes: "Storage",
  gateway_class_a: "Storage writes",
  gateway_class_b: "Storage reads",
  gateway_egress_bytes: "Download bandwidth",
  share_token_egress_bytes: "Public link bandwidth",
  kb_index_byte_seconds: "Knowledge storage",
  agent_messages: "Agent chat messages",
};

/** Display order — top-to-bottom in the stack and left-to-right in
 *  the legend. Storage at the bottom (it's the foundation; visually
 *  reads as ground), traffic above, agent at the top. */
export const METER_STACK_ORDER: string[] = [
  "storage_used_bytes",
  "kb_index_byte_seconds",
  "gateway_class_a",
  "gateway_class_b",
  "gateway_egress_bytes",
  "share_token_egress_bytes",
  "agent_messages",
];
