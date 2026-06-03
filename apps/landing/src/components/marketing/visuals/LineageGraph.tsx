import {
  FileText,
  Search,
  Brain,
  ShieldCheck,
  CornerDownRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * LineageGraph — a static "backward lineage" diagram. Start from an output an
 * agent produced; every input that shaped it hangs below it on a hairline
 * elbow, the OpenLineage mental model rendered as a file-tree.
 *
 * Each source node carries a type chip (retrieval / tool / memory) and a
 * Verify affordance — the web2 framing of "check this record independently".
 * No JS-measured SVG lines: connectors are a left hairline + per-row tick, so
 * the graph is robust and responsive by construction.
 *
 * Hairline-only, single Krater accent on the output node and the verify chips.
 */

type Kind = "retrieval" | "tool" | "memory";

type Source = {
  kind: Kind;
  icon: LucideIcon;
  label: string;
  detail: string;
  verifiable: boolean;
};

const SOURCES: Source[] = [
  {
    kind: "retrieval",
    icon: FileText,
    label: "pricing-faq.md · §3",
    detail: "chunk · score 0.92",
    verifiable: true,
  },
  {
    kind: "retrieval",
    icon: FileText,
    label: "billing-policy.md · §1.4",
    detail: "chunk · score 0.88",
    verifiable: true,
  },
  {
    kind: "tool",
    icon: Search,
    label: "search",
    detail: 'query: "refund policy" → 4 hits',
    verifiable: false,
  },
  {
    kind: "memory",
    icon: Brain,
    label: "recall · user prefs",
    detail: "2 notes · markdown output",
    verifiable: true,
  },
];

const KIND_LABEL: Record<Kind, string> = {
  retrieval: "Retrieval",
  tool: "Tool call",
  memory: "Memory",
};

export function LineageGraph({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream p-5 md:p-6",
        className
      )}
    >
      {/* Output node — the artifact you clicked */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-krater/30 bg-krater/[0.05] px-4 py-3">
        <span className="inline-flex items-center gap-2.5">
          <FileText size={15} strokeWidth={1.5} className="text-krater" />
          <span className="font-mono text-[13px] text-ink">report.md</span>
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-krater">
          Output
        </span>
      </div>

      <p className="mt-3 mb-1 pl-1 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
        Built from
      </p>

      {/* Sources — hang off a single hairline with per-row elbow ticks */}
      <ul className="relative ml-2 border-l border-stone-200/80 pl-5">
        {SOURCES.map((s) => (
          <li key={s.kind + s.label} className="relative py-2">
            {/* elbow tick into the row */}
            <span
              aria-hidden
              className="absolute -left-5 top-1/2 h-px w-5 bg-stone-200/80"
            />
            <div className="flex items-center justify-between gap-3 rounded-md border border-stone-200/60 bg-stone-50/60 px-3.5 py-2.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <s.icon
                  size={14}
                  strokeWidth={1.5}
                  className="shrink-0 text-stone-500"
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-[13px] text-ink">
                    {s.label}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-stone-500">
                    {s.detail}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="hidden text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500 sm:inline">
                  {KIND_LABEL[s.kind]}
                </span>
                {s.verifiable && (
                  <span className="inline-flex items-center gap-1.5 rounded-sm border border-krater/30 bg-krater/[0.05] px-2 py-1 font-mono text-[11px] text-krater">
                    <ShieldCheck size={10} strokeWidth={1.5} />
                    verify
                  </span>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-center gap-1.5 pl-1 text-[12px] text-stone-500">
        <CornerDownRight size={12} strokeWidth={1.5} />
        Every node traces back to a record you can verify.
      </p>
    </div>
  );
}
