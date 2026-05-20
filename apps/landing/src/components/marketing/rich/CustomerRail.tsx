import { ArrowUpRight } from "lucide-react";
import { FadeUp } from "@/components/motion/FadeUp";

export type CustomerCase = {
  company: string;
  metric: string;
  metricLabel: string;
  chips: string[];
  href?: string;
};

export function CustomerRail({ cases }: { cases: CustomerCase[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
      {cases.map((c, i) => (
        <FadeUp key={c.company} delay={i * 0.04} className="bg-cream">
          <a
            href={c.href ?? "#"}
            className="group flex h-full flex-col gap-6 p-8 transition-colors hover:bg-stone-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-[16px] font-medium tracking-[0.02em] text-ink">
                {c.company}
              </span>
              <ArrowUpRight
                size={16}
                strokeWidth={1.5}
                className="text-stone-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </div>
            <div>
              <div className="text-[40px] leading-[1] tracking-[-0.02em] text-ink">
                {c.metric}
              </div>
              <div className="mt-2 text-[13px] text-stone-600">{c.metricLabel}</div>
            </div>
            <div className="mt-auto flex flex-wrap gap-1.5">
              {c.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-sm border border-stone-200/60 px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-stone-600"
                >
                  {chip}
                </span>
              ))}
            </div>
          </a>
        </FadeUp>
      ))}
    </div>
  );
}
