import { FileText, Lock, Search, Quote, Repeat } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * NavGlyphs — small, high-fidelity product slices for the nav dropdown panels.
 * Each one is a miniature of its section's real UI: a sealed bucket, a retrieval
 * pass with a citation, a recorded run. Hairline rows on the panel's stone-50,
 * one Krater accent each, fully static (no motion, no shadow).
 */

/* Storage — a mini bucket: object rows, the top one sealed. */
export function StorageGlyph() {
  return (
    <div className="w-full space-y-1.5">
      <FileRow name="report.pdf" sealed />
      <FileRow name="notes.md" />
      <FileRow name="data.csv" />
    </div>
  );
}

function FileRow({ name, sealed }: { name: string; sealed?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-stone-200/70 bg-cream px-2 py-1.5">
      <FileText size={12} strokeWidth={1.5} className="shrink-0 text-stone-400" />
      <span className="flex-1 truncate font-mono text-[10px] text-stone-600">{name}</span>
      {sealed ? (
        <Lock size={11} strokeWidth={1.5} className="shrink-0 text-krater" />
      ) : (
        <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />
      )}
    </div>
  );
}

/* Knowledge — a query, a retrieval grid with top-k lit, a citation. */
const HOT = new Set([3, 7, 14, 19, 26, 31]);

export function KnowledgeGlyph() {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-1.5 rounded-sm border border-stone-200/70 bg-cream px-2 py-1.5">
        <Search size={11} strokeWidth={1.5} className="shrink-0 text-stone-400" />
        <span className="truncate font-mono text-[10px] text-stone-500">refund policy</span>
      </div>
      <div className="grid grid-cols-12 gap-0.5">
        {Array.from({ length: 36 }).map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              "aspect-square rounded-[1px]",
              HOT.has(i) ? "bg-krater/80" : "bg-krater/15"
            )}
          />
        ))}
      </div>
      <span className="inline-flex items-center gap-1 rounded-sm border border-krater/30 bg-krater/[0.06] px-1.5 py-0.5 text-krater">
        <Quote size={9} strokeWidth={1.5} />
        <span className="font-mono text-[9px]">pricing-faq.md · 0.92</span>
      </span>
    </div>
  );
}

/* Agents — a mini run trace ending in a replayable receipt. */
export function AgentsGlyph() {
  return (
    <div className="w-full space-y-1.5">
      <ToolRow tool="recall" result="2 notes" />
      <ToolRow tool="search" result="4 hits" />
      <div className="flex items-center justify-between gap-2 border-t border-stone-200/60 pt-2">
        <span className="font-mono text-[9px] text-stone-500">run · 3f4d…ae</span>
        <span className="inline-flex items-center gap-1 rounded-sm border border-krater/30 bg-krater/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-krater">
          <Repeat size={9} strokeWidth={1.5} />
          replayable
        </span>
      </div>
    </div>
  );
}

function ToolRow({ tool, result }: { tool: string; result: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-stone-200/70 bg-cream px-2 py-1.5">
      <span className="font-mono text-[10px] text-krater">{tool}</span>
      <span className="font-mono text-[9px] text-stone-500">→ {result}</span>
    </div>
  );
}
