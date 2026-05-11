type Tone = "idle" | "success" | "error" | "warning" | "info";

export function Dot({ tone = "idle" }: { tone?: Tone }) {
  return <span className={`dot dot-${tone}`} />;
}
