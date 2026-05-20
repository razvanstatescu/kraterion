import { cn } from "@/lib/cn";

export function ChunkingRibbon({ className }: { className?: string }) {
  // Each chunk: relative width
  const chunks = [18, 15, 22, 13, 19, 17, 20, 16];
  const total = chunks.reduce((a, b) => a + b, 0);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-stone-200/60 bg-cream", className)}>
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Chunking · onboarding-guide.pdf · 1.2 MB
        </span>
        <span className="font-mono text-[11px] text-stone-600">8 chunks · avg 480 tokens</span>
      </div>
      <div className="px-6 py-8 md:px-10 md:py-10">
        {/* Document — long rectangle of hairline "paragraphs" */}
        <div className="relative">
          <div className="grid grid-cols-1 gap-2 rounded-md border border-stone-200/60 bg-stone-50 p-4">
            <div className="h-2 w-full rounded-full bg-stone-200/80" />
            <div className="h-2 w-[92%] rounded-full bg-stone-200/80" />
            <div className="h-2 w-[87%] rounded-full bg-stone-200/80" />
            <div className="h-2 w-[94%] rounded-full bg-stone-200/80" />
            <div className="h-2 w-[78%] rounded-full bg-stone-200/80" />
          </div>

          {/* Vertical dashed splitters */}
          <div className="pointer-events-none absolute inset-0 flex">
            {chunks.slice(0, -1).reduce<React.ReactNode[]>((acc, c, i) => {
              const left = chunks.slice(0, i + 1).reduce((a, b) => a + b, 0) / total;
              acc.push(
                <span
                  key={i}
                  className="absolute top-0 bottom-0 w-px"
                  style={{
                    left: `${left * 100}%`,
                    borderLeft: "1px dashed #C45B36",
                    opacity: 0.7,
                  }}
                />
              );
              return acc;
            }, [])}
          </div>
        </div>

        {/* Connectors */}
        <div className="mt-2 grid" style={{ gridTemplateColumns: chunks.map((c) => `${c}fr`).join(" ") }}>
          {chunks.map((_, i) => (
            <div key={i} className="flex justify-center">
              <span aria-hidden className="h-3 w-px border-l border-dashed border-stone-400" />
            </div>
          ))}
        </div>

        {/* Chunk tiles */}
        <div className="grid gap-2" style={{ gridTemplateColumns: chunks.map((c) => `${c}fr`).join(" ") }}>
          {chunks.map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 rounded-sm border border-stone-200/60 bg-cream px-2 py-2"
            >
              <span className="font-mono text-[10px] tabular-nums text-krater">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[10px] text-stone-500">~{480} tokens</span>
            </div>
          ))}
        </div>

        {/* Embed row */}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-stone-500">
          <span aria-hidden className="h-px flex-1 bg-stone-200" />
          <span className="font-mono uppercase tracking-[0.12em]">embedded · 1,536 dims · stored</span>
          <span aria-hidden className="h-px flex-1 bg-stone-200" />
        </div>
      </div>
    </div>
  );
}
