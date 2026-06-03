import { FadeUp } from "@/components/motion/FadeUp";

const PROBLEMS = [
  {
    n: "01",
    title: "Agents are black boxes.",
    body: "Your agent retrieves files, calls tools, and writes to memory. When the answer is wrong, you can't see which step caused it. Debugging is guesswork.",
  },
  {
    n: "02",
    title: "Runs don't reproduce.",
    body: "The same input gives a different output every time. Once a run ends, the trace is gone — you can't replay the bug, and you can't prove how a past decision was made.",
  },
  {
    n: "03",
    title: "Your logs aren't yours.",
    body: "Tracing tools keep their records in their database — mutable, sampled, and on their retention clock. You can't verify them independently, and you can't take them with you.",
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
