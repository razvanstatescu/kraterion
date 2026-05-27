import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { SealingFlow } from "@/components/marketing/SealingFlow";
import { EnvelopeSealingSchema } from "@/components/marketing/visuals/EnvelopeSealingSchema";
import { BeforeAfterOwnership } from "@/components/marketing/visuals/BeforeAfterOwnership";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { CornerTicks } from "@/components/marketing/visuals/CornerTicks";
import {
  BookOpen,
  Layers,
  MessageCircle,
  Key,
  ShieldCheck,
  Check,
  XCircle,
  Lock,
} from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Security & ownership — Kraterion",
  description:
    "Your data. Your keys. Your exit. Most storage products promise ownership in a marketing line. We make it a property of the system.",
};

const CLAIMS = [
  {
    n: "01",
    title: "You can leave anytime.",
    body: "Files are stored as plain bytes addressed by a stable ID. Any S3-compatible client can pull them. You don't need our tools to leave us.",
  },
  {
    n: "02",
    title: "Sealed before it leaves you.",
    body: "Files are encrypted on your device before they ever reach the platform. The platform sees only encrypted bytes.",
  },
  {
    n: "03",
    title: "Revocable access — enforced, not promised.",
    body: "When you remove access, the decryption keys stop being issued. The ciphertext sitting on disk becomes unreadable to the revoked party.",
  },
  {
    n: "04",
    title: "A verifiable audit log.",
    body: "Every artifact — upload, indexing run, agent answer, citation — is bound to a uniquely-IDed, version-tracked record. Anyone can independently verify the history.",
  },
];

const REVOCATION = [
  { n: "01", step: "Define a policy", detail: "Who can decrypt; under what conditions." },
  { n: "02", step: "Key servers enforce it", detail: "Independent servers check the policy on every request." },
  { n: "03", step: "Request access", detail: "Authorized clients receive key shares; unauthorized clients receive nothing." },
  { n: "04", step: "Revoke", detail: "Remove access — key servers stop issuing shares. Existing ciphertext stays unreadable." },
];

const AUDIT_ROWS = [
  { id: "upload_a4f2c8…", version: "v12", digest: "0x9c4a8b21f0e7c2…", actor: "you@acme-co.com", action: "Put object", time: "2026-05-20 14:02:11" },
  { id: "index_run_91…", version: "v7", digest: "0x4d2f0e9c7b81a…", actor: "system", action: "Index bucket", time: "2026-05-20 14:02:14" },
  { id: "agent_answer_22…", version: "v3", digest: "0x4f1ab3a0e7c2f…", actor: "support-agent", action: "Cite chunk", time: "2026-05-20 14:02:18" },
  { id: "citation_07…", version: "v2", digest: "0xfa0012a4e7c2f…", actor: "support-agent", action: "Bind source", time: "2026-05-20 14:02:18" },
  { id: "access_grant_3…", version: "v1", digest: "0xa1b2c3d4e5f6a…", actor: "you@acme-co.com", action: "Grant team-read", time: "2026-05-20 13:58:42" },
];

const SECURITY_STATS = [
  { value: "0", label: "plaintext bytes leave your device", sub: "Encryption is the default" },
  { value: "TLS 1.3", label: "in transit", sub: "Modern ciphers only" },
  { value: "t-of-n", label: "threshold encryption", sub: "Multiple key servers" },
  { value: "90 days", label: "access log retention", sub: "Audit-ready" },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <FadeUp>
            <NumberedEyebrow n="SO" label="Security & ownership" />
            <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
              Your data.
              <br />
              Your keys.
              <br />
              <span className="text-stone-500">Your exit.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              Most storage products promise ownership in a marketing line. Kraterion makes it a property of the system — sealed before upload, owned by you, stored as ciphertext-only on Walrus.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="mailto:hello@kraterion.com?subject=Beta%20access%20request" variant="primary">
                Get early access →
              </ButtonLink>
              <ButtonLink href="#sealing" variant="ghost">
                How sealing works
              </ButtonLink>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
              <span>You hold the keys</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Sealed at upload</span>
              <span aria-hidden className="h-1 w-1 rounded-full bg-stone-300" />
              <span>Revocable by structure</span>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mx-auto w-full max-w-[520px]">
              <KeyCustodyPanel />
            </div>
          </FadeUp>
        </div>
      </section>

      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={SECURITY_STATS} />
        </div>
      </section>

      {/* Before / After ownership */}
      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="00a" label="The shift" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Same files. Different perimeter.
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <BeforeAfterOwnership />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Four claims */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="Four claims" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                What ownership
                <br />
                actually means here.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            {CLAIMS.map((c) => (
              <FadeUp key={c.n} className="bg-cream p-8 md:p-10">
                <div className="font-mono text-[12px] tabular-nums text-krater">{c.n}</div>
                <h3 className="mt-4 text-[24px] leading-[1.25] text-ink">{c.title}</h3>
                <p className="mt-3 text-[15px] leading-[1.65] text-stone-700">{c.body}</p>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <BridgeHeadline tone="ink" align="left">
        Plaintext never leaves
        <br />
        <span className="text-stone-500">the laptop.</span>
      </BridgeHeadline>

      {/* Sealing flow */}
      <section id="sealing" className="bg-ink py-24 md:py-32 text-cream">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="How sealing works" tone="ink" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Encrypted before it leaves you.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] text-stone-300">
                Encryption happens on your device. We store only what we can&apos;t read.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <EnvelopeSealingSchema />
            </div>
          </FadeUp>
          <FadeUp delay={0.15}>
            <div className="mt-8">
              <SealingFlow />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Revocation */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="How revocable access works" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Policy is the gate. Not a promise.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] text-stone-700">
                When you revoke access, the system stops issuing the keys needed to decrypt. Existing ciphertext doesn&apos;t have to be deleted to be unreadable to a revoked party.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-4">
            {REVOCATION.map((s) => (
              <FadeUp key={s.n} className="bg-cream p-6 md:p-7">
                <div className="font-mono text-[12px] tabular-nums text-krater">{s.n}</div>
                <div className="mt-3 text-[16px] font-medium text-ink">{s.step}</div>
                <p className="mt-2 text-[13px] leading-[1.6] text-stone-700">{s.detail}</p>
              </FadeUp>
            ))}
          </div>

          {/* Policy diagram */}
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-stone-50">
              <div className="border-b border-stone-200/60 bg-cream px-4 py-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                Policy · bucket.support-docs
              </div>
              <div className="p-6 font-mono text-[12px] leading-[1.7] text-stone-700">
                <div className="text-stone-500">// stored as a public, verifiable record</div>
                <div>
                  <span className="text-krater">policy</span> bucket.support-docs &#123;
                </div>
                <div className="pl-4">
                  <span className="text-stone-500">allow</span>{" "}
                  <span className="text-ink">team@acme-co.com</span>{" "}
                  <span className="text-stone-500">→</span> read, write
                </div>
                <div className="pl-4">
                  <span className="text-stone-500">allow</span>{" "}
                  <span className="text-ink">kr_share_test_3f4d…</span>{" "}
                  <span className="text-stone-500">→</span> read (origin: acme-co.com)
                </div>
                <div className="pl-4 line-through opacity-50">
                  <span className="text-stone-500">allow</span>{" "}
                  <span className="text-ink">ex-employee@acme-co.com</span>{" "}
                  <span className="text-stone-500">→</span> read
                </div>
                <div className="pl-4 text-[color:var(--color-error)]">
                  <span className="text-stone-500">// </span>
                  revoked 2026-05-12 · ciphertext now unreadable to this party
                </div>
                <div>&#125;</div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Audit log */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Verifiable audit log" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                A tamper-evident history.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] text-stone-700">
                Every artifact has a uniquely-IDed, version-tracked record. The history is independently verifiable.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <div className="grid grid-cols-[1.4fr_0.5fr_1.4fr_1.2fr_1fr_1fr] gap-2 border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                <span>Manifest ID</span>
                <span>Ver</span>
                <span>Digest</span>
                <span>Actor</span>
                <span>Action</span>
                <span>Time</span>
              </div>
              {AUDIT_ROWS.map((row, i) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-[1.4fr_0.5fr_1.4fr_1.2fr_1fr_1fr] items-center gap-2 px-4 py-3 text-[12px] hover:bg-stone-50 ${
                    i < AUDIT_ROWS.length - 1 ? "border-b border-stone-200/60" : ""
                  }`}
                >
                  <span className="font-mono text-ink">{row.id}</span>
                  <span className="font-mono text-stone-500">{row.version}</span>
                  <span className="font-mono text-stone-600">{row.digest}</span>
                  <span className="text-stone-700">{row.actor}</span>
                  <span className="text-stone-700">{row.action}</span>
                  <span className="font-mono text-stone-500">{row.time}</span>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Compliance */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="05" label="Compliance" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Plain English.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
            <ComplianceItem
              tone="success"
              title="Encrypted in transit"
              detail="TLS 1.3 with modern cipher suites."
            />
            <ComplianceItem
              tone="success"
              title="Access logs"
              detail="Server-side access logs retained for 90 days."
            />
            <ComplianceItem
              tone="warning"
              title="SOC 2"
              detail="In progress — on the roadmap."
            />
            <ComplianceItem
              tone="stone"
              title="HIPAA / PHI"
              detail="Not suitable for regulated personal data. See limits below."
            />
          </div>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Trust by structure"
        headline={
          <>
            Storage that earns trust
            <br />
            <span className="text-stone-500">by structure, not promise.</span>
          </>
        }
        sub="Sealed before upload. Revocable by policy. Verifiable end-to-end."
        satellites={[
          { icon: BookOpen, label: "Read the security docs", detail: "How sealing, policy, and audit work.", href: "/docs" },
          { icon: Layers, label: "Compliance", detail: "TLS 1.3 · access logs · SOC 2 in progress.", href: "#" },
          { icon: MessageCircle, label: "Talk to security", detail: "Custom DPAs and reviews.", href: "mailto:security@kraterion.com" },
        ]}
      />
    </>
  );
}

function KeyCustodyPanel() {
  return (
    <div className="relative">
      <CornerTicks />
      <div className="overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
        {/* Chrome */}
        <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Lock size={12} strokeWidth={1.75} className="text-stone-500" />
            <span className="font-mono text-[11px] tabular-nums text-stone-700">
              bucket.support-docs
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.16em] text-stone-500">
            Key custody
          </span>
        </div>

        {/* You hold */}
        <div className="border-b border-stone-200/60 px-5 py-5">
          <div className="flex items-center gap-2">
            <Key size={11} strokeWidth={1.75} className="text-krater" />
            <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-krater">
              You hold
            </span>
          </div>
          <div className="mt-3 space-y-2.5">
            <CustodyRow
              label="DEK"
              detail="generated on device · per file"
              hash="0x9c4a8b21f0e7c2"
              accent
            />
            <CustodyRow
              label="KEK"
              detail="threshold split · 2-of-3 key servers"
              hash="t-of-n shares"
              accent
            />
          </div>
        </div>

        {/* Policy */}
        <div className="border-b border-stone-200/60 px-5 py-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={11} strokeWidth={1.75} className="text-stone-600" />
            <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-600">
              Policy · who can decrypt
            </span>
          </div>
          <div className="mt-3 space-y-1.5 font-mono text-[12px] leading-[1.5]">
            <PolicyRow
              state="allow"
              who="team@acme-co.com"
              meta="read · write"
            />
            <PolicyRow
              state="allow"
              who="kr_share_test_3f4d…01ab"
              meta="read · origin acme-co.com"
            />
            <PolicyRow
              state="revoked"
              who="ex-employee@acme-co.com"
              meta="revoked · t+0"
            />
          </div>
        </div>

        {/* Platform holds */}
        <div className="bg-stone-50 px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
              Platform holds
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-sm bg-stone-200/70">
                <Lock size={12} strokeWidth={1.75} className="text-stone-500" />
              </span>
              <div>
                <div className="font-mono text-[12px] text-stone-700">ciphertext</div>
                <div className="font-mono text-[11px] text-stone-500">2.1 MB · opaque</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-stone-500">cannot decrypt</div>
              <div className="text-[11px] text-stone-500">without your keys</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustodyRow({
  label,
  detail,
  hash,
  accent,
}: {
  label: string;
  detail: string;
  hash: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={`grid h-6 w-6 place-items-center rounded-sm ${
            accent ? "bg-krater/10 text-krater" : "bg-stone-100 text-stone-500"
          }`}
        >
          <Check size={11} strokeWidth={2} />
        </span>
        <div>
          <span className="font-mono text-[12px] text-ink">{label}</span>
          <span className="ml-2 text-[12px] text-stone-600">{detail}</span>
        </div>
      </div>
      <span className="font-mono text-[10px] tabular-nums text-stone-500">{hash}</span>
    </div>
  );
}

function PolicyRow({
  state,
  who,
  meta,
}: {
  state: "allow" | "revoked";
  who: string;
  meta: string;
}) {
  const revoked = state === "revoked";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-sm px-2 py-1.5 ${
        revoked ? "bg-[color:var(--color-error)]/5" : "bg-stone-50"
      }`}
    >
      <div className="flex items-center gap-2">
        {revoked ? (
          <XCircle size={11} strokeWidth={1.75} className="text-[color:var(--color-error)]" />
        ) : (
          <Check size={11} strokeWidth={2} className="text-stone-500" />
        )}
        <span className={`${revoked ? "text-stone-500 line-through" : "text-ink"}`}>
          {who}
        </span>
      </div>
      <span
        className={`text-[10px] uppercase tracking-[0.14em] ${
          revoked ? "text-[color:var(--color-error)]" : "text-stone-500"
        }`}
      >
        {meta}
      </span>
    </div>
  );
}

function ComplianceItem({
  tone,
  title,
  detail,
}: {
  tone: "success" | "warning" | "stone";
  title: string;
  detail: string;
}) {
  const dotColor =
    tone === "success" ? "#5C7A3F" : tone === "warning" ? "#C28A3C" : "#C9BFA8";
  return (
    <FadeUp className="flex items-start gap-4 bg-cream p-8">
      <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor }} />
      <div>
        <div className="text-[16px] font-medium text-ink">{title}</div>
        <p className="mt-1.5 text-[14px] leading-[1.6] text-stone-700">{detail}</p>
      </div>
    </FadeUp>
  );
}
