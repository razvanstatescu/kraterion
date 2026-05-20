"use client";

import { StateTransition } from "./rich/StateTransition";

export function KnowledgeStates() {
  return (
    <StateTransition
      tone="cream"
      interval={3200}
      frames={[
        {
          label: "Ask",
          node: (
            <div className="h-full bg-cream p-6 md:p-8">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                user
              </div>
              <p className="mt-4 max-w-[520px] text-[20px] leading-[1.4] text-ink">
                What is our refund policy for annual plans?
              </p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-sm bg-stone-100 px-2 py-1 font-mono text-[11px] text-stone-600">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-krater" />
                support-agent · POST /v1/chat/completions
              </div>
            </div>
          ),
        },
        {
          label: "Retrieve",
          node: (
            <div className="h-full bg-cream p-6 md:p-8">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                retrieving · top-k = 8 → rerank to 4
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { name: "pricing-faq.md", chunk: "§3", score: "0.92" },
                  { name: "billing-policy.md", chunk: "§1.4", score: "0.81" },
                  { name: "annual-plans.md", chunk: "§2", score: "0.74" },
                  { name: "support-runbook.md", chunk: "§8", score: "0.62" },
                ].map((r, i) => (
                  <div
                    key={r.name}
                    className="flex items-center gap-3 rounded-sm border border-stone-200/60 bg-stone-50 px-3 py-2 text-[12px]"
                    style={{ opacity: 1 - i * 0.12 }}
                  >
                    <span className="flex-1 font-mono text-ink">{r.name}</span>
                    <span className="font-mono text-stone-500">{r.chunk}</span>
                    <span className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-stone-600">
                      {r.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          label: "Answer",
          node: (
            <div className="h-full bg-cream p-6 md:p-8">
              <div className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                answer
              </div>
              <p className="mt-4 max-w-[520px] text-[16px] leading-[1.6] text-ink">
                Annual plans are pro-rated. Refunds for the unused portion are processed within 7 business days from the original payment method.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-sm border border-krater/40 bg-krater/10 px-2 py-1 font-mono text-[11px] text-krater">
                  pricing-faq.md · §3
                </span>
                <span className="inline-flex items-center gap-2 rounded-sm border border-krater/40 bg-krater/10 px-2 py-1 font-mono text-[11px] text-krater">
                  annual-plans.md · §2
                </span>
              </div>
              <div className="mt-4 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-medium text-[color:var(--color-success)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]" />
                verifiable
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
