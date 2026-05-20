import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { SectionFrame } from "@/components/marketing/SectionFrame";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Security & ownership — Kraterion",
  description:
    "Your data. Your keys. Your exit. Most storage products promise ownership in a marketing line. We make it a property of the system.",
};

const CLAIMS = [
  {
    n: 1,
    title: "You can leave anytime — your bytes don't vanish.",
    body: "Files are stored as plain bytes addressed by a stable ID. Any S3-compatible client can pull them. You don't need our tools to leave us.",
  },
  {
    n: 2,
    title: "Sealed before it leaves you.",
    body: "Files are encrypted on your device before they ever reach the platform. The platform sees only encrypted bytes.",
  },
  {
    n: 3,
    title: "Revocable access — enforced, not promised.",
    body: "When you remove access, the decryption keys stop being issued. The ciphertext sitting on disk becomes unreadable to the revoked party.",
  },
  {
    n: 4,
    title: "A verifiable audit log.",
    body: "Every artifact — upload, indexing run, agent answer, citation — is bound to a uniquely-IDed, version-tracked record. Anyone can independently verify the history.",
  },
];

const SEALING = [
  { step: "Encrypt locally", detail: "Your client encrypts the file before upload." },
  { step: "Upload ciphertext", detail: "Only encrypted bytes leave your machine." },
  { step: "Store ciphertext", detail: "We hold encrypted bytes; we cannot decrypt them." },
  { step: "Decrypt locally on read", detail: "Your client requests the key and decrypts after retrieval." },
];

const REVOCATION = [
  { step: "Define a policy", detail: "Who can decrypt; under what conditions." },
  { step: "Key servers enforce it", detail: "Independent servers check the policy on every request." },
  { step: "Request access", detail: "Authorized clients receive key shares; unauthorized clients receive nothing." },
  { step: "Revoke", detail: "Remove access — key servers stop issuing shares. Existing ciphertext stays unreadable to the revoked party." },
];

const AUDIT_ROWS = [
  ["upload_a4f2", "v12", "0x9c4a…b21f"],
  ["index_run_91", "v7", "0x4d2f…0e9c"],
  ["agent_answer_22", "v3", "0x4f…1ab3"],
  ["citation_07", "v2", "0xfa…0012"],
];

export default function Page() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream pt-40 pb-16">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <p className="micro text-stone-500">Security & ownership</p>
            <h1 className="mt-4 max-w-[860px] text-[40px] leading-[1.05] tracking-[-0.02em] md:text-[72px]">
              Your data. Your keys. Your exit.
            </h1>
            <p className="mt-8 max-w-[640px] text-[18px] text-stone-700">
              Most storage products promise ownership in a marketing line. We make it a property of the system.
            </p>
          </FadeUp>
        </div>
      </section>

      <SectionFrame
        eyebrow="Four claims"
        headline="What ownership actually means here."
      >
        <div className="grid gap-12 md:grid-cols-2">
          {CLAIMS.map((c) => (
            <FadeUp key={c.n}>
              <div className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-stone-200/60 text-[13px] font-medium text-stone-600">
                  {c.n}
                </span>
                <div>
                  <h3 className="text-[20px] leading-[1.3] text-ink">{c.title}</h3>
                  <p className="mt-2 text-[15px] leading-[1.6] text-stone-700">{c.body}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame
        tone="ink"
        eyebrow="How sealing works"
        headline="Encrypted before it leaves you."
        lede="Encryption happens on your device. We store only what we can't read."
      >
        <div className="grid gap-4 md:grid-cols-4">
          {SEALING.map((s, i) => (
            <FadeUp key={s.step} delay={i * 0.05}>
              <div className="h-full rounded-lg border border-stone-800 bg-stone-900/40 p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-stone-400">Step {i + 1}</div>
                <div className="mt-3 text-[16px] font-medium text-cream">{s.step}</div>
                <p className="mt-2 text-[13px] text-stone-300">{s.detail}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="How revocable access works"
        headline="Policy is the gate, not a promise."
        lede="When you revoke access, the system stops issuing the keys needed to decrypt. Existing ciphertext doesn't have to be deleted to be unreadable to a revoked party."
      >
        <div className="grid gap-4 md:grid-cols-4">
          {REVOCATION.map((s, i) => (
            <FadeUp key={s.step} delay={i * 0.05}>
              <div className="h-full rounded-lg border border-stone-200/60 bg-cream p-5">
                <div className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Step {i + 1}</div>
                <div className="mt-3 text-[16px] font-medium text-ink">{s.step}</div>
                <p className="mt-2 text-[13px] text-stone-700">{s.detail}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="Verifiable audit log"
        headline="A tamper-evident history."
        lede="Every artifact has a uniquely-IDed, version-tracked record. The history is independently verifiable."
      >
        <div className="overflow-hidden rounded-lg border border-stone-200/60 bg-cream font-mono">
          <div className="grid grid-cols-[1.2fr_0.6fr_1.4fr] gap-2 border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-stone-500">
            <span>Manifest ID</span>
            <span>Version</span>
            <span>Last digest</span>
          </div>
          {AUDIT_ROWS.map((row) => (
            <div
              key={row[0]}
              className="grid grid-cols-[1.2fr_0.6fr_1.4fr] items-center gap-2 border-b border-stone-200/60 px-4 py-3 text-[13px] last:border-b-0"
            >
              <span className="text-ink">{row[0]}</span>
              <span className="text-stone-600">{row[1]}</span>
              <span className="text-stone-600">{row[2]}</span>
            </div>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="Compliance & operational practice"
        headline="Plain English."
      >
        <ul className="grid gap-3 text-[15px] text-stone-700 md:grid-cols-2">
          <li className="flex items-start gap-3 rounded-lg border border-stone-200/60 bg-cream p-4">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-success)]" />
            Encrypted in transit (TLS 1.3).
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-stone-200/60 bg-cream p-4">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-success)]" />
            Server-side access logs retained for 90 days.
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-stone-200/60 bg-cream p-4">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-warning)]" />
            SOC 2 in progress — on the roadmap.
          </li>
          <li className="flex items-start gap-3 rounded-lg border border-stone-200/60 bg-cream p-4">
            <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-stone-300" />
            Not for HIPAA / PHI / regulated personal data.
          </li>
        </ul>
      </SectionFrame>

      <section className="bg-cream">
        <div className="mx-auto max-w-[1280px] px-6 py-32 text-center">
          <FadeUp>
            <h2 className="mx-auto max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
              Take a closer look.
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-10 flex justify-center">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free →</ButtonLink>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  );
}
