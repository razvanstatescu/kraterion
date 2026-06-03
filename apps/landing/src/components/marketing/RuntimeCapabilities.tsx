import Link from "next/link";
import { Repeat, GitBranch, Package, Brain, ArrowRight } from "lucide-react";
import { FadeUp } from "@/components/motion/FadeUp";

/**
 * RuntimeCapabilities — a 4-up card grid that names what the runtime gives you
 * once an agent runs through Kraterion. Each card is a quiet link into its
 * deep-dive page. Hairline-only, single Krater accent on the hover arrow.
 *
 * Web2 framing throughout: replay, audit, integrate, remember — the on-chain
 * mechanism stays on the deep pages, not here.
 */

const CAPS: {
  icon: typeof Repeat;
  title: string;
  body: string;
  href: string;
  meta: string;
}[] = [
  {
    icon: Repeat,
    title: "Replay any run",
    body: "Rerun a past run against the same inputs and retrieved data. Compare the original and the replay side by side.",
    href: "/runs",
    meta: "Replay & audit",
  },
  {
    icon: GitBranch,
    title: "Trace every output",
    body: "Click any output and walk back through every chunk, tool call, and memory write that shaped it. Verify each one independently.",
    href: "/runs#lineage",
    meta: "Audit trail",
  },
  {
    icon: Package,
    title: "Drop into your stack",
    body: "Wrap a LangGraph graph or Vercel AI SDK agent with one import. Runs record themselves — no other code change.",
    href: "/docs/langgraph",
    meta: "SDKs",
  },
  {
    icon: Brain,
    title: "Give agents memory",
    body: "Turn on persistent memory and the agent decides when to remember and recall. Scoped to credentials you can revoke.",
    href: "/memory",
    meta: "Memory",
  },
];

export function RuntimeCapabilities() {
  return (
    <div className="grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
      {CAPS.map((c, i) => (
        <FadeUp key={c.href} delay={i * 0.06} className="bg-cream">
          <Link
            href={c.href}
            className="group flex h-full flex-col gap-4 p-8 transition-colors hover:bg-stone-50 md:p-10"
          >
            <div className="flex items-center justify-between">
              <c.icon size={20} strokeWidth={1.5} className="text-stone-500" />
              <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
                {c.meta}
              </span>
            </div>
            <h3 className="text-[22px] leading-[1.2] tracking-[-0.01em] text-ink md:text-[24px]">
              {c.title}
            </h3>
            <p className="flex-1 text-[14px] leading-[1.65] text-stone-700">
              {c.body}
            </p>
            <span className="inline-flex items-center gap-1.5 text-[13px] text-stone-500 group-hover:text-krater">
              Learn more
              <ArrowRight
                size={14}
                strokeWidth={1.5}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </Link>
        </FadeUp>
      ))}
    </div>
  );
}
