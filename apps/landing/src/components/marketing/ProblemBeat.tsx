import { FadeUp } from "@/components/motion/FadeUp";

const PROBLEMS = [
  {
    n: "01",
    title: "You rent. You don't own.",
    body: "Cancel your account and the files disappear. Get locked out and they're gone. Your data lives at the provider's pleasure — not as a property you hold.",
  },
  {
    n: "02",
    title: "Privacy is a promise.",
    body: "The provider holds your encryption keys. Their policy says they won't read your data. There's no mechanism to enforce that — only their word, and their bad weeks.",
  },
  {
    n: "03",
    title: "Agents read on trust.",
    body: "Your AI walks through your files and returns answers. Nothing proves the answer came from what you actually stored. The retrieval is a black box; the citations are unverifiable.",
  },
];

export function ProblemBeat() {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
      {PROBLEMS.map((p, i) => (
        <FadeUp
          key={p.n}
          delay={i * 0.06}
          className="flex flex-col gap-4 bg-cream p-8 md:p-10"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[12px] tabular-nums text-krater">
              {p.n}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
              Today
            </span>
          </div>
          <h3 className="text-[22px] leading-[1.2] tracking-[-0.01em] text-ink md:text-[26px]">
            {p.title}
          </h3>
          <p className="text-[14px] leading-[1.65] text-stone-700">{p.body}</p>
        </FadeUp>
      ))}
    </div>
  );
}
