import Link from "next/link";
import { ScrollText, KeyRound, GitBranch, ArrowRight, type LucideIcon } from "lucide-react";
import { FadeUp } from "@/components/motion/FadeUp";

/**
 * ComplianceTeaser — a short home beat: most AI regulation asks for the same
 * three things, and Kraterion provides each. Links to the deeper /compliance
 * page. Hedged wording (helps / built for), no certification claims.
 */

const ITEMS: { icon: LucideIcon; title: string; rule: string; body: string }[] = [
  {
    icon: ScrollText,
    title: "Durable audit logs",
    rule: "EU AI Act · ISO 42001",
    body: "Every run is a tamper-evident record you keep as long as you need.",
  },
  {
    icon: KeyRound,
    title: "Data control & erasure",
    rule: "GDPR",
    body: "Encrypted by default and revocable — lock data out or erase by destroying the key.",
  },
  {
    icon: GitBranch,
    title: "Traceability",
    rule: "NIST AI RMF",
    body: "Replay any run and trace every output back to its sources.",
  },
];

export function ComplianceTeaser() {
  return (
    <div>
      <div className="grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
        {ITEMS.map((item, i) => (
          <FadeUp key={item.title} delay={i * 0.06} className="bg-cream p-8 md:p-10">
            <div className="flex items-center justify-between">
              <item.icon size={20} strokeWidth={1.5} className="text-stone-500" />
              <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
                {item.rule}
              </span>
            </div>
            <h3 className="mt-4 text-[20px] leading-[1.25] text-ink">{item.title}</h3>
            <p className="mt-2 text-[14px] leading-[1.65] text-stone-700">{item.body}</p>
          </FadeUp>
        ))}
      </div>
      <FadeUp delay={0.1}>
        <Link
          href="/compliance"
          className="group mt-6 inline-flex items-center gap-1.5 text-[15px] text-ink"
        >
          <span className="underline underline-offset-4 decoration-stone-400 group-hover:decoration-ink">
            See how Kraterion fits AI governance
          </span>
          <ArrowRight
            size={15}
            strokeWidth={1.5}
            className="text-stone-500 transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </FadeUp>
    </div>
  );
}
