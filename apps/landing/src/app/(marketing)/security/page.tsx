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
import { BookOpen, Layers, MessageCircle } from "lucide-react";

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
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <NumberedEyebrow n="SO" label="Security & ownership" />
            <h1 className="mt-6 max-w-[860px] text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
              Your data.
              <br />
              Your keys.
              <br />
              <span className="text-stone-500">Your exit.</span>
            </h1>
            <p className="mt-6 max-w-[600px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
              Most storage products promise ownership in a marketing line. Kraterion makes it a property of the system — sealed before upload via Seal, owned on-chain via Sui, stored as ciphertext-only on Walrus.
            </p>
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
      <section className="bg-ink py-24 md:py-32 text-cream">
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
