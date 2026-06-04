import type { Metadata } from "next";
import {
  FileText,
  Terminal as TerminalIcon,
  Key,
  ArrowLeftRight,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { StorageSchema } from "@/components/marketing/visuals/StorageSchema";
import { BookOpen, ScrollText, Layers } from "lucide-react";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import { CornerTicks } from "@/components/marketing/visuals/CornerTicks";

export const dynamic = "force-static";

const OG = "/api/og?surface=S3%20API%20%26%20SDKs&title=S3%20you%20actually%20own.";

export const metadata: Metadata = {
  title: "S3 API & SDKs — Kraterion",
  description:
    "Same S3 SDKs. Sealed before upload, recorded against your account, every action stamped to a tamper-evident log you can verify independently.",
  openGraph: { images: [OG] },
  twitter: { images: [OG] },
};

const SDK_TABS = [
  {
    lang: "python",
    filename: "boto3.py",
    code: `import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.kraterion.com",
    aws_access_key_id="...",
    aws_secret_access_key="...",
)
s3.upload_file("photo.jpg", "my-bucket", "photo.jpg")`,
  },
  {
    lang: "bash",
    filename: "aws-cli.sh",
    code: `export AWS_ENDPOINT_URL=https://s3.kraterion.com
aws s3 mb s3://my-bucket
aws s3 cp ./photo.jpg s3://my-bucket/
aws s3 ls s3://my-bucket/`,
  },
  {
    lang: "bash",
    filename: "rclone.conf",
    code: `[kraterion]
type = s3
provider = Other
endpoint = https://s3.kraterion.com
access_key_id = ...
secret_access_key = ...`,
  },
  {
    lang: "typescript",
    filename: "node.ts",
    code: `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: "https://s3.kraterion.com",
  region: "auto",
  credentials: { accessKeyId: "...", secretAccessKey: "..." },
});

await s3.send(
  new PutObjectCommand({ Bucket: "my-bucket", Key: "photo.jpg", Body: file })
);`,
  },
];

const MIGRATION_TABS = [
  {
    lang: "bash",
    filename: "rclone.sh",
    code: `rclone sync s3://old-bucket kraterion:my-bucket --progress`,
  },
  {
    lang: "bash",
    filename: "aws-cli.sh",
    code: `aws s3 sync s3://old-bucket s3://my-bucket \\
  --source-endpoint-url https://s3.amazonaws.com \\
  --endpoint-url https://s3.kraterion.com`,
  },
];

const S3_STATS = [
  { value: "Yours", label: "By construction", sub: "Every object recorded against your account" },
  { value: "Sealed", label: "Before upload", sub: "Encryption is the default, not a setting" },
  { value: "Verifiable", label: "End-to-end", sub: "Every action has a tamper-evident record" },
  { value: "Portable", label: "Anytime", sub: "Standard S3 clients on the way in and out" },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
          <div>
            <FadeUp>
              <NumberedEyebrow n="S3" label="Object storage" />
              <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
                S3 you
                <br />
                <span className="text-stone-500">actually own.</span>
              </h1>
              <p className="mt-6 max-w-[540px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
                Same SDKs you already use — boto3, aws-cli, rclone. This is the foundation the runtime sits on: your files, knowledge bases, run records, and memory all live here, sealed before upload and recorded against your account. Not a customer promise. A property of the system.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <ButtonLink
                  href="mailto:hello@kraterion.com?subject=Beta%20access%20request"
                  variant="primary"
                  size="lg"
                >
                  Get early access →
                </ButtonLink>
                <a
                  href="/docs/quickstart"
                  className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
                >
                  Quickstart
                </a>
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Sealed
                </span>
                <span aria-hidden className="h-px w-6 bg-stone-300" />
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Audited
                </span>
                <span aria-hidden className="h-px w-6 bg-stone-300" />
                <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                  Portable
                </span>
              </div>
            </FadeUp>
          </div>

          <div className="relative">
            <FadeUp delay={0.35} className="mx-auto w-full max-w-[520px]">
              <LiveBucketVisual />
            </FadeUp>
          </div>
        </div>
      </section>

      {/* Value-prop stat strip */}
      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={S3_STATS} />
        </div>
      </section>

      {/* Four claims — the central differentiator */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="What's different" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Storage that&apos;s yours,
                <br />
                <span className="text-stone-500">in and out.</span>
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Most storage products promise ownership in a marketing line. Kraterion makes it a property of the system — enforced by structure, not by trust.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-stone-200/60 bg-stone-200/60 md:grid-cols-2">
              <Claim
                n="01"
                icon={Key}
                title="You own the bytes."
                body="Every object is recorded against your account, not ours. Cancel the service tomorrow — the files don't disappear. Keep them funded directly, or pull them out via any S3 client. We're a service, not a custodian."
              />
              <Claim
                n="02"
                icon={ArrowLeftRight}
                title="Portable, both ways."
                body="No proprietary import, no proprietary export. Point any S3 client in; pull every byte out at ~9× lower egress than AWS. Leaving costs nothing beyond standard egress — no exit tax, no migration window."
              />
            </div>
          </FadeUp>
          <FadeUp delay={0.15}>
            <p className="mt-6 max-w-[640px] text-[15px] leading-[1.6] text-stone-600">
              Every object is also encrypted before upload, with access you can revoke and a tamper-evident record of every action.{" "}
              <a href="/security" className="text-ink underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
                See the security model
              </a>
              .
            </p>
          </FadeUp>
        </div>
      </section>

      {/* Audit trail visual — proof of the fourth claim */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Audit trail" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Every action leaves a record.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Storage activity, access changes, knowledge runs, agent invocations — they all write to the same append-only log. Each row has a uniquely-IDed digest you can verify independently, without trusting us.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <AuditTrailVisual />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Architecture — supporting detail, no longer headline */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Under the surface" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Same S3 surface.
                <br />
                <span className="text-stone-500">Different spine.</span>
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Your S3 client hits a single gateway endpoint. Behind it, three concerns run in parallel — the encryption envelope, the storage layer, and the ownership + audit record — without you wiring any of them.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <StorageSchema />
            </div>
          </FadeUp>
        </div>
      </section>

      <BridgeHeadline align="left">
        Same SDKs you already use.
        <br />
        <span className="text-stone-500">Just change the endpoint.</span>
      </BridgeHeadline>

      {/* Drop-in code — single tight section, no technical deep-dive */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Drop-in" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Point a client at us.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                One environment variable. The S3 commands you already write — <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">PUT</code>, <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">GET</code>, <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">LIST</code>, presigned URLs — work without modification.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <CodeBlock tabs={SDK_TABS} />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Migration — coming and going */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="05" label="Move in. Leave the same way." />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                No proprietary import.
                <br />
                <span className="text-stone-500">No proprietary export.</span>
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Repoint your client and write new objects against the new endpoint, or run a one-shot sync from your old bucket. Leaving works exactly the same way — reverse the endpoint flags, pull every byte out via standard tools. No exit tax, no migration window.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <CodeBlock tabs={MIGRATION_TABS} />
            </div>
          </FadeUp>
        </div>
      </section>

      <PremiumCTA
        eyebrow="Drop in"
        headline={
          <>
            Point a client at us.
            <br />
            <span className="text-stone-500">See for yourself.</span>
          </>
        }
        primaryHref="mailto:hello@kraterion.com?subject=Beta%20access%20request"
        primaryLabel="Get early access →"
        sub="One environment variable changes. Everything else stays the same."
        satellites={[
          { icon: BookOpen, label: "Quickstart", detail: "Five lines to a sealed bucket.", href: "/docs/quickstart" },
          { icon: Layers, label: "Security model", detail: "Sealing, revocation, audit trail — in depth.", href: "/security" },
          { icon: ScrollText, label: "Pricing", detail: "Cheap egress, real free band, no tier surprises.", href: "/pricing" },
        ]}
      />
    </>
  );
}

/* ─── Claim card (used 4× in the differentiator grid) ──────────── */

function Claim({
  n,
  icon: Icon,
  title,
  body,
}: {
  n: string;
  icon: typeof Key;
  title: string;
  body: string;
}) {
  return (
    <FadeUp className="flex flex-col gap-4 bg-cream p-8 md:p-10">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] tabular-nums text-krater">{n}</span>
        <Icon size={18} strokeWidth={1.5} className="text-stone-500" />
      </div>
      <h3 className="mt-2 text-[24px] leading-[1.2] tracking-[-0.01em] text-ink md:text-[28px]">
        {title}
      </h3>
      <p className="text-[14px] leading-[1.65] text-stone-700">{body}</p>
    </FadeUp>
  );
}

/* ─── Live bucket visual (hero right) ───────────────────────────── */

const BUCKET_FILES: { name: string; size: string }[] = [
  { name: "photo-final-v3.jpg", size: "2.1 MB" },
  { name: "dataset-2026-05.parquet", size: "118 MB" },
  { name: "report-q1.pdf", size: "482 KB" },
  { name: "logo-v2.svg", size: "24 KB" },
];

function LiveBucketVisual() {
  return (
    <div className="relative">
      <CornerTicks color="#A89C82" size={10} inset={-8} />
      <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
        {/* Browser chrome */}
        <div className="flex items-center gap-2.5 border-b border-stone-200/60 bg-stone-50 px-3 py-2">
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-2 w-2 rounded-full bg-stone-300" />
            ))}
          </div>
          <span className="flex items-center gap-1 font-mono text-[10.5px] text-stone-500">
            <span className="text-stone-400">https://</span>
            <span className="text-ink">s3.kraterion.com</span>
            <span className="text-stone-400">/assets-prod</span>
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-stone-200/60 bg-cream px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
            Bucket · assets-prod
          </span>
          <span className="font-mono text-[11px] text-stone-600">
            4 files · 138 MB
          </span>
        </div>

        <ul className="divide-y divide-stone-200/60">
          {BUCKET_FILES.map((f) => (
            <li
              key={f.name}
              className="grid grid-cols-[1fr_auto_84px] items-center gap-3 px-4 py-2 text-[12px]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <FileText size={13} strokeWidth={1.5} className="text-stone-500" />
                <span className="truncate font-mono text-ink">{f.name}</span>
              </span>
              <span className="font-mono tabular-nums text-[11px] text-stone-600">
                {f.size}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-stone-600">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]"
                />
                Sealed
              </span>
            </li>
          ))}
        </ul>

        {/* Recent action with the audit moment */}
        <div className="border-t border-stone-200/60 bg-stone-50/40">
          <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50/60 px-4 py-2">
            <div className="flex items-center gap-2">
              <TerminalIcon
                size={11}
                strokeWidth={1.5}
                className="text-stone-500"
              />
              <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
                Just now · aws-cli
              </span>
            </div>
            <span className="font-mono text-[10px] text-stone-500">
              recorded
            </span>
          </div>
          <div className="space-y-1 px-4 py-3 font-mono text-[12px] leading-[1.55]">
            <div className="flex gap-2 text-stone-700">
              <span className="text-stone-400">$</span>
              <span>
                aws s3 cp ./photo.jpg{" "}
                <span className="text-ink">s3://assets-prod/</span>
              </span>
            </div>
            <div className="text-[color:var(--color-success)]">
              upload: ./photo.jpg → photo.jpg
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
              <span aria-hidden className="h-1 w-1 rounded-full bg-krater" />
              audit record · 9c4a8b21f0e7…
            </div>
          </div>
        </div>

        {/* Footer — provenance summary */}
        <div className="grid grid-cols-3 divide-x divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60">
          <FootStat label="Owner" value="you@acme-co" />
          <FootStat label="At rest" value="Sealed" accent />
          <FootStat label="Trail" value="6 events" />
        </div>
      </div>
    </div>
  );
}

function FootStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5">
      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span
        className={`font-mono tabular-nums text-[12px] ${
          accent ? "text-krater" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Audit trail visual ────────────────────────────────────────── */

type AuditEvent = {
  time: string;
  action: string;
  subject: string;
  detail: string;
  digest: string;
  variant: "default" | "revoke" | "issue";
};

const AUDIT_EVENTS: AuditEvent[] = [
  {
    time: "14:02:11",
    action: "UPLOAD",
    subject: "photo-final-v3.jpg",
    detail: "by you@acme-co.com · 2.1 MB · sealed",
    digest: "9c4a8b21f0e7c2…",
    variant: "default",
  },
  {
    time: "13:58:22",
    action: "ISSUE",
    subject: "share token · kr_share_test_92ac…",
    detail: "scope support-docs · origin docs.acme-co.com",
    digest: "4f1ab3a0e7c2f9…",
    variant: "issue",
  },
  {
    time: "13:55:07",
    action: "REVOKE",
    subject: "share token · kr_share_test_1a8b…",
    detail: "access policy updated · enforced at t+0",
    digest: "fa0012a4e7c2f1…",
    variant: "revoke",
  },
];

function AuditTrailVisual() {
  return (
    <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      {/* Chrome */}
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Audit · bucket assets-prod
        </span>
        <span className="font-mono text-[11px] text-stone-600">
          last 24 hours
        </span>
      </div>

      {/* Column header (desktop) */}
      <div className="hidden grid-cols-[88px_88px_1fr_180px] items-center gap-4 border-b border-stone-200/60 bg-stone-50/40 px-5 py-2.5 text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500 md:grid">
        <span>Time</span>
        <span>Action</span>
        <span>Subject</span>
        <span>Record</span>
      </div>

      <ul className="divide-y divide-stone-200/60">
        {AUDIT_EVENTS.map((e, i) => (
          <EventRow key={i} event={e} />
        ))}
      </ul>

      {/* Footer band — the promise the trail makes */}
      <div className="grid grid-cols-1 divide-y divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60 md:grid-cols-3 md:divide-x md:divide-y-0">
        <FooterBlock label="Verifiable" value="Independently" accent />
        <FooterBlock label="Append-only" value="No mutations" />
        <FooterBlock
          label="Visibility"
          value="By you · by anyone you choose"
        />
      </div>
    </div>
  );
}

function EventRow({ event }: { event: AuditEvent }) {
  const dotColor =
    event.variant === "revoke"
      ? "#A89C82"
      : event.variant === "issue"
      ? "#C45B36"
      : "#5C7A3F";
  const actionColor =
    event.variant === "revoke"
      ? "text-stone-500"
      : event.variant === "issue"
      ? "text-krater"
      : "text-ink";

  return (
    <li className="grid grid-cols-1 items-baseline gap-x-4 gap-y-1 px-5 py-3.5 text-[13px] md:grid-cols-[88px_88px_1fr_180px]">
      {/* Time (always visible) */}
      <span className="flex items-center gap-2 font-mono text-[12px] tabular-nums text-stone-600">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: dotColor }}
        />
        {event.time}
      </span>

      {/* Action (mono, uppercase) */}
      <span className={`font-mono text-[12px] uppercase tracking-[0.12em] ${actionColor}`}>
        {event.action}
      </span>

      {/* Subject + detail */}
      <div className="flex flex-col gap-0.5 md:col-span-1">
        <span className="text-ink">{event.subject}</span>
        <span className="font-mono text-[11.5px] leading-[1.45] text-stone-500">
          {event.detail}
        </span>
      </div>

      {/* Record digest */}
      <span className="font-mono text-[11px] text-stone-500 md:text-right">
        {event.digest}
      </span>
    </li>
  );
}

function FooterBlock({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-5 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span
        className={`font-mono text-[13px] ${
          accent ? "text-krater" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

