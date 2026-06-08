import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { EuStars } from "@/components/marketing/EuStars";
import {
  ScrollText,
  KeyRound,
  GitBranch,
  BadgeCheck,
  ShieldCheck,
  Check,
  Landmark,
  HeartPulse,
  Building2,
  Bot,
  BookOpen,
  MessageCircle,
  Globe,
  Timer,
  Trash2,
  Lock,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Compliance & governance — Kraterion",
  description:
    "AI rules keep coming back to the same things: prove what your AI did, keep durable logs, and control the data behind it. Kraterion gives you those technical controls — audit trails, encryption, revocable access, and replay.",
};

const STATS = [
  { value: "Aug 2026", label: "EU AI Act high-risk obligations apply", sub: "Annex III systems" },
  { value: "6 months", label: "minimum AI log retention", sub: "EU AI Act Art. 12 / 19" },
  { value: "Art. 17", label: "GDPR right to erasure", sub: "2026 enforcement priority" },
  { value: "yours", label: "data + logs you own", sub: "Not vendor-held" },
];

/* What the rules keep asking for, mapped to a Kraterion primitive. */
const PILLARS: { icon: LucideIcon; title: string; rule: string; body: string }[] = [
  {
    icon: ScrollText,
    title: "Durable audit logs",
    rule: "EU AI Act · ISO 42001",
    body: "High-risk AI must automatically record what it did and keep it (6 months minimum). Every Kraterion run is a tamper-evident record you keep as long as you need.",
  },
  {
    icon: KeyRound,
    title: "Data control & erasure",
    rule: "GDPR",
    body: "People can ask to be forgotten. Because data is encrypted and access is revocable, you can lock it out or erase it by destroying the key — and prove you did.",
  },
  {
    icon: GitBranch,
    title: "Traceability & provenance",
    rule: "ISO 42001 · NIST AI RMF",
    body: "Frameworks want to reconstruct how a decision was made. Lineage shows every input behind an output; replay reproduces the run against the same data.",
  },
];

/* Regulation-by-regulation. Hedged: we provide controls, not certification. */
type Reg = {
  badge: "eu" | LucideIcon;
  name: string;
  scope: string;
  requires: string;
  helps: string[];
};

const REGS: Reg[] = [
  {
    badge: "eu",
    name: "EU AI Act",
    scope: "High-risk AI · obligations apply Aug 2, 2026",
    requires:
      "Automatic event logs over the system's lifetime, kept six months at minimum (Art. 12 / 19). Traceability of inputs to outputs, and technical documentation you can produce on request — retained up to 10 years (Art. 18).",
    helps: ["Run records", "Tamper-evident logs", "Replay", "Lineage"],
  },
  {
    badge: "eu",
    name: "GDPR",
    scope: "Personal data · right to erasure (Art. 17)",
    requires:
      "Lawful control over personal data: restrict access, honor erasure requests, and keep data in a region you choose. EU data-protection authorities accept cryptographic erasure — destroying the key — as valid deletion.",
    helps: ["Encrypted by default", "Revoke access", "Cryptographic erasure", "Owned & portable"],
  },
  {
    badge: BadgeCheck,
    name: "ISO 42001 · NIST AI RMF",
    scope: "AI governance frameworks",
    requires:
      "Continuous traceability — a versioned accountability record with input provenance, outputs, approvals, and retention an external reviewer can follow end to end.",
    helps: ["Run records", "Lineage", "Verifiable citations", "You own the logs"],
  },
];

const USE_CASES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Landmark, title: "Financial services", body: "Agents that touch advice, underwriting, or trading — where every decision needs a defensible record." },
  { icon: HeartPulse, title: "Healthcare & life sciences", body: "Sensitive data with strict access, residency, and deletion requirements." },
  { icon: Building2, title: "Public sector", body: "Procurement and citizen-facing AI that must be transparent and auditable by design." },
  { icon: Bot, title: "Anyone shipping high-risk AI", body: "If your agent influences real decisions, you'll be asked to show your work." },
];

/* How data is handled — the questions every security review asks. */
const DATA_HANDLING: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Globe, title: "Residency you choose", body: "Your data lives on storage you own and control. Keep it in a region you pick, and move it out anytime with standard tools." },
  { icon: Lock, title: "Encrypted, keys you hold", body: "Everything is sealed before it leaves you. The platform stores ciphertext only — we never hold the keys to your data." },
  { icon: Trash2, title: "Deletion that proves itself", body: "Erase by destroying the key. EU regulators recognize cryptographic erasure, and access is revocable in a single step." },
  { icon: Timer, title: "Retention on your terms", body: "You decide how long run records and logs live — no vendor retention cliff, no traces aging out on someone else's clock." },
];

/* Honest posture. status: done | progress | none. */
const TRUST_SIGNALS: { label: string; detail: string; status: "done" | "progress" | "none" }[] = [
  { label: "Encryption in transit", detail: "TLS 1.3, modern ciphers only", status: "done" },
  { label: "Encryption at rest", detail: "Sealed client-side before upload", status: "done" },
  { label: "Data processing agreement", detail: "DPA available on request", status: "done" },
  { label: "Subprocessor list", detail: "Published and kept current", status: "done" },
  { label: "Responsible disclosure", detail: "security@kraterion.com", status: "done" },
  { label: "SOC 2 Type II", detail: "In progress — on the roadmap", status: "progress" },
  { label: "ISO 42001", detail: "Aligned; certification on the roadmap", status: "progress" },
  { label: "HIPAA / PHI", detail: "Not currently supported", status: "none" },
];

const STATUS_COLOR: Record<"done" | "progress" | "none", string> = {
  done: "var(--color-success)",
  progress: "#C28A3C",
  none: "#C9BFA8",
};

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <FadeUp>
            <NumberedEyebrow n="CG" label="Compliance & governance" />
            <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
              Built for the rules
              <br />
              <span className="text-stone-500">AI is facing.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              New AI regulation keeps coming back to the same questions: can you show what your AI did, keep the record, and control the data behind it? Kraterion is built to give you those technical controls — out of the box, not bolted on.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="mailto:hello@kraterion.com?subject=Compliance%20questions" variant="primary">
                Talk to us
              </ButtonLink>
              <ButtonLink href="#regulations" variant="ghost">
                Regulation by regulation
              </ButtonLink>
            </div>
            <p className="mt-6 text-[13px] text-stone-500">
              DPA, subprocessor list, and security docs available on request ·{" "}
              <a
                href="mailto:security@kraterion.com"
                className="text-stone-600 underline underline-offset-4 decoration-stone-300 hover:decoration-ink"
              >
                security@kraterion.com
              </a>
            </p>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mx-auto w-full max-w-[520px]">
              <RequirementsPanel />
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={STATS} />
        </div>
      </section>

      {/* What the rules ask for */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="The common thread" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Different rules, three demands.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Strip away the acronyms and most AI regulation asks for the same three things. Kraterion provides each as a property of the system.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-3">
            {PILLARS.map((p) => (
              <FadeUp key={p.title} className="bg-cream p-8 md:p-10">
                <div className="flex items-center justify-between">
                  <p.icon size={20} strokeWidth={1.5} className="text-stone-500" />
                  <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
                    {p.rule}
                  </span>
                </div>
                <h3 className="mt-4 text-[22px] leading-[1.25] text-ink">{p.title}</h3>
                <p className="mt-3 text-[14px] leading-[1.65] text-stone-700">{p.body}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <BridgeHeadline align="left">
        The controls regulators ask for —
        <br />
        <span className="text-stone-500">already in the product.</span>
      </BridgeHeadline>

      {/* Regulation by regulation */}
      <section id="regulations" className="scroll-mt-24 bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Regulation by regulation" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                What it asks. What we give you.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 flex flex-col gap-4">
            {REGS.map((r) => (
              <FadeUp key={r.name}>
                <RegRow reg={r} />
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* How data is handled */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="How your data is handled" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Your data, on your terms.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                The questions every security review asks — where the data lives, who can read it, how it&apos;s deleted, how long it&apos;s kept. Here, the answers are properties of the system.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            {DATA_HANDLING.map((d) => (
              <FadeUp key={d.title} className="bg-cream p-8 md:p-10">
                <d.icon size={20} strokeWidth={1.5} className="text-stone-500" />
                <h3 className="mt-4 text-[20px] leading-[1.25] text-ink">{d.title}</h3>
                <p className="mt-2 text-[14px] leading-[1.65] text-stone-700">{d.body}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Trust signals / posture */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Our posture" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Where we stand today.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                What&apos;s in place, what&apos;s in progress, and what isn&apos;t supported yet — stated plainly. We&apos;d rather you know than guess.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            {TRUST_SIGNALS.map((s) => (
              <FadeUp
                key={s.label}
                className="flex items-start gap-4 bg-cream p-6 md:p-7"
              >
                <span
                  aria-hidden
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: STATUS_COLOR[s.status] }}
                />
                <div>
                  <div className="text-[15px] text-ink">{s.label}</div>
                  <div className="mt-1 text-[13px] leading-[1.5] text-stone-600">{s.detail}</div>
                </div>
              </FadeUp>
            ))}
          </div>
          <FadeUp delay={0.1}>
            <p className="mt-6 text-[14px] leading-[1.6] text-stone-600">
              Need our DPA, subprocessor list, or a security review?{" "}
              <a
                href="mailto:security@kraterion.com"
                className="text-ink underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
              >
                security@kraterion.com
              </a>{" "}
              — documentation is available on request.
            </p>
          </FadeUp>
        </div>
      </section>

      {/* Use cases */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="05" label="Who this is for" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Teams that have to show their work.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            {USE_CASES.map((u) => (
              <FadeUp key={u.title} className="flex items-start gap-4 bg-cream p-8 md:p-10">
                <u.icon size={22} strokeWidth={1.5} className="mt-0.5 shrink-0 text-stone-500" />
                <div>
                  <h3 className="text-[18px] leading-[1.25] text-ink">{u.title}</h3>
                  <p className="mt-2 text-[14px] leading-[1.6] text-stone-700">{u.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* Honest boundary */}
      <section className="bg-ink py-24 md:py-32 text-cream">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="06" label="Worth being clear about" tone="ink" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Controls, not a checkbox.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-300">
                Kraterion gives you the technical controls these rules call for — durable logs, encryption, revocable access, replay, and lineage. It doesn&apos;t make you compliant on its own, and nothing here is legal advice. Your compliance program is yours; we make the evidence easy to produce.
              </p>
            </div>
          </FadeUp>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Compliance & governance"
        headline={
          <>
            Ship AI you can
            <br />
            <span className="text-stone-500">stand behind in an audit.</span>
          </>
        }
        sub="Durable audit trails. Data you own and can erase. Runs you can replay."
        satellites={[
          { icon: ShieldCheck, label: "Security model", detail: "Sealing, revocation, and the audit log.", href: "/security" },
          { icon: BookOpen, label: "Replay & audit", detail: "How every run becomes a record.", href: "/runs" },
          { icon: MessageCircle, label: "Talk to us", detail: "DPAs, residency, and audit support.", href: "mailto:hello@kraterion.com" },
        ]}
      />
    </>
  );
}

/* ─── Regulation row ────────────────────────────────────────────── */

function RegRow({ reg }: { reg: Reg }) {
  return (
    <div className="hairline grid grid-cols-1 gap-6 rounded-lg border border-stone-200/60 bg-cream p-6 md:grid-cols-[1fr_1fr] md:p-8">
      {/* What it asks */}
      <div>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md border border-stone-200/60 bg-stone-50 text-stone-600">
            {reg.badge === "eu" ? (
              <EuStars size={22} className="text-krater" />
            ) : (
              <reg.badge size={20} strokeWidth={1.5} />
            )}
          </span>
          <div>
            <h3 className="text-[18px] leading-[1.2] text-ink">{reg.name}</h3>
            <p className="text-[12px] text-stone-500">{reg.scope}</p>
          </div>
        </div>
        <p className="mt-4 text-[14px] leading-[1.6] text-stone-700">
          <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
            What it asks
          </span>
          <br />
          {reg.requires}
        </p>
      </div>

      {/* How Kraterion helps */}
      <div className="md:border-l md:border-stone-200/60 md:pl-8">
        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          How Kraterion helps
        </span>
        <ul className="mt-3 flex flex-wrap gap-2">
          {reg.helps.map((h) => (
            <li
              key={h}
              className="inline-flex items-center gap-1.5 rounded-sm border border-krater/30 bg-krater/[0.05] px-2.5 py-1 text-[12px] text-krater"
            >
              <Check size={11} strokeWidth={2} />
              {h}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── Hero requirements panel ───────────────────────────────────── */

const REQ_ROWS: { req: string; tag: string; met: string }[] = [
  { req: "Automatic, durable logs", tag: "EU AI Act", met: "Run records" },
  { req: "Right to erasure", tag: "GDPR", met: "Revoke + crypto-erase" },
  { req: "Traceability", tag: "ISO 42001", met: "Lineage + replay" },
  { req: "Data residency & ownership", tag: "GDPR", met: "You own the bytes" },
];

function RequirementsPanel() {
  return (
    <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          <EuStars size={14} className="text-krater" />
          Regulatory requirements
        </span>
        <span className="font-mono text-[11px] text-stone-500">mapped</span>
      </div>
      <ul className="divide-y divide-stone-200/60">
        {REQ_ROWS.map((row) => (
          <li key={row.req} className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <div className="truncate text-[14px] text-ink">{row.req}</div>
              <div className="text-[11px] text-stone-500">
                {row.tag} · met by {row.met}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/[0.06] px-2 py-1 font-mono text-[11px] text-[color:var(--color-success)]">
              <Check size={11} strokeWidth={2.5} />
              covered
            </span>
          </li>
        ))}
      </ul>
      <div className="border-t border-stone-200/60 bg-stone-50/60 px-4 py-2.5 text-[11px] text-stone-500">
        Technical controls — not legal advice.
      </div>
    </div>
  );
}
