import { Hero } from "./Hero";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { BucketFlowRibbon } from "./BucketFlowRibbon";
import { S3ScrubBeatServer } from "./S3ScrubBeatServer";
import { AgentTools } from "./AgentTools";
import { OwnershipClaims } from "./OwnershipClaims";
import { SdkFanout } from "./visuals/SdkFanout";
import { BeforeAfterOwnership } from "./visuals/BeforeAfterOwnership";
import { UploadPipeline } from "./visuals/UploadPipeline";
import { MetricCard } from "./visuals/MetricCard";
import { PremiumCTA } from "./visuals/PremiumCTA";
import { BookOpen, ScrollText, MessageCircle } from "lucide-react";
import { TerminalSim, type TerminalLine } from "./TerminalSim";
import { PricingTeaser } from "./PricingTeaser";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "./rich/NumberedEyebrow";
import { BridgeHeadline } from "./rich/BridgeHeadline";
import { ProblemBeat } from "./ProblemBeat";

const S3_TABS = [
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
aws s3 cp ./photo.jpg s3://my-bucket/`,
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

const AGENT_TABS = [
  {
    lang: "bash",
    filename: "curl",
    code: `curl https://api.kraterion.com/v1/agents/support/chat/completions \\
  -H "Authorization: Bearer $KRATERION_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"What is our refund policy?"}]}'`,
  },
  {
    lang: "typescript",
    filename: "openai.ts",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.kraterion.com/v1/agents/support",
  apiKey: process.env.KRATERION_KEY,
});

const r = await client.chat.completions.create({
  model: "support",
  messages: [{ role: "user", content: "What is our refund policy?" }],
});`,
  },
];

const TERMINAL_LINES: TerminalLine[] = [
  { kind: "prompt", text: "pip install boto3" },
  { kind: "prompt", text: "export AWS_ENDPOINT_URL=https://s3.kraterion.com" },
  { kind: "prompt", text: "aws s3 mb s3://my-bucket" },
  { kind: "prompt", text: "aws s3 cp ./photo.jpg s3://my-bucket/" },
  { kind: "output", text: "upload: ./photo.jpg to s3://my-bucket/photo.jpg" },
  { kind: "prompt", text: "kraterion index s3://my-bucket --enable-rag" },
  { kind: "success", text: "✓ indexed 1 file • ready to query" },
];

const RECENT_CALLS = [
  { id: "1", t: "14:02:11", q: "What is our refund policy?", ms: "184ms" },
  { id: "2", t: "14:01:48", q: "How long does annual proration last?", ms: "212ms" },
  { id: "3", t: "13:58:22", q: "Compare Pro and Team tiers", ms: "198ms" },
  { id: "4", t: "13:55:07", q: "Cancel mid-cycle?", ms: "171ms" },
];

export function Landing() {
  return (
    <>
      <Hero />

      {/* 01 — Problem */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="00" label="The problem" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                The way storage works today.
              </h2>
              <p className="mt-6 max-w-[640px] text-[18px] leading-[1.55] text-stone-700">
                Cloud storage is a great deal — until cancellation, lock-out, or a quiet policy change reminds you whose files those actually are.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12">
            <ProblemBeat />
          </div>
        </div>
      </section>

      {/* Bridge — pivot from problem to solution */}
      <BridgeHeadline align="left">
        Same surface.
        <br />
        <span className="text-stone-500">Different spine.</span>
      </BridgeHeadline>

      {/* 02 — Storage */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="Storage" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Speaks S3.
                <br />
                <span className="text-stone-500">Stays yours.</span>
              </h2>
              <p className="mt-6 max-w-[600px] text-[18px] leading-[1.55] text-stone-700">
                Point any S3 client at us — boto3, aws-cli, rclone, the SDKs. The bytes are stored as plain objects you can pull from any region. Leaving means walking out with your files, not paying egress to do it.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid items-stretch gap-4 md:grid-cols-2">
            <FadeUp className="flex">
              <SdkFanout className="w-full" />
            </FadeUp>
            <FadeUp delay={0.1} className="flex flex-col gap-4">
              <UploadPipeline />
              <div className="grid grid-cols-2 gap-4">
                <MetricCard
                  value="11"
                  label="S3 ops, supported"
                  hint="Put, Get, List, Multipart…"
                />
                <MetricCard
                  value="0 ms"
                  label="rewrite needed"
                  hint="One env var changes"
                />
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* S3 code beat — sits inside the storage story */}
      <S3ScrubBeatServer tabs={S3_TABS} />

      {/* 03 — Knowledge (ribbon owns its own title) */}
      <section className="bg-ink text-cream">
        <BucketFlowRibbon
          eyebrowN="02"
          eyebrowLabel="Knowledge"
          headline={
            <>
              Bucket → indexed → answered.
            </>
          }
          lede="Flip one toggle. Hybrid retrieval — BM25 plus dense vectors, reranked. Every answer carries a citation you can verify against the source file."
        />
      </section>

      {/* 04 — Agents */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Agents" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                OpenAI-compatible.
                <br />
                <span className="text-stone-500">Scoped by default.</span>
              </h2>
              <p className="mt-6 max-w-[600px] text-[18px] leading-[1.55] text-stone-700">
                Replace the base URL — your existing OpenAI client now runs against your bucket. Each agent gets its own credential you can grant, audit, and revoke per agent. Not one master key for everything.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid items-stretch gap-4 md:grid-cols-[1.15fr_0.85fr]">
            <FadeUp className="flex">
              <div className="w-full">
                <CodeBlock tabs={AGENT_TABS} />
              </div>
            </FadeUp>
            <FadeUp delay={0.1} className="flex">
              <div className="hairline flex w-full flex-col overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
                <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                    Agent · support
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-600">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]"
                    />
                    ready
                  </span>
                </div>
                <dl className="divide-y divide-stone-200/60">
                  <Row label="Endpoint" value="/v1/agents/support" />
                  <Row label="Bucket" value="support-docs · 18 files" />
                  <Row label="Model" value="claude-haiku-4-5" />
                  <Row label="Tools" value="5 · search, read, list, write, manifest" />
                  <Row label="Quota" value="100k / mo" />
                  <Row label="Last call" value="3 minutes ago" />
                </dl>

                <div className="flex flex-1 flex-col border-t border-stone-200/60">
                  <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50/60 px-4 py-2">
                    <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
                      Recent calls
                    </span>
                    <span className="font-mono text-[10px] text-stone-500">last 24h</span>
                  </div>
                  <ul className="flex-1 divide-y divide-stone-200/60">
                    {RECENT_CALLS.map((c) => (
                      <li
                        key={c.id}
                        className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-[12px]"
                      >
                        <span className="font-mono tabular-nums text-[10px] text-stone-500">
                          {c.t}
                        </span>
                        <span className="truncate text-stone-700">{c.q}</span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-stone-500">
                          <span
                            aria-hidden
                            className="h-1 w-1 rounded-full bg-[color:var(--color-success)]"
                          />
                          {c.ms}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="grid grid-cols-3 divide-x divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60">
                    <Stat label="P50" value="184 ms" />
                    <Stat label="Tools" value="5" accent />
                    <Stat label="Lock-in" value="0" />
                  </div>
                </div>
              </div>
            </FadeUp>
          </div>
          <div className="mt-12">
            <AgentTools />
          </div>
        </div>
      </section>

      {/* 05 — Ownership: the brand promise */}
      <section className="bg-ink text-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Why this matters" tone="ink" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Your data.
                <br />
                Your keys.
                <br />
                <span className="text-stone-500">Your exit.</span>
              </h2>
              <p className="mt-6 max-w-[600px] text-[18px] leading-[1.55] text-stone-300">
                Most storage products promise ownership in a marketing line. Kraterion makes it a property of the system — sealed before upload, revocable by structure, portable by construction.
              </p>
            </div>
          </FadeUp>
          <div className="mt-16">
            <BeforeAfterOwnership />
          </div>
          <div className="mt-12">
            <OwnershipClaims />
          </div>
        </div>
      </section>

      {/* 06 — Quickstart */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="05" label="Quickstart" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Five lines to a queryable bucket.
              </h2>
              <p className="mt-6 text-[16px] leading-[1.55] text-stone-700">
                The tools you already have, pointed at us. Then one extra line to turn the bucket into a knowledge base.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <TerminalSim lines={TERMINAL_LINES} interactive />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* 07 — Pricing teaser */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="06" label="Pricing" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                No egress traps.
              </h2>
              <p className="mt-6 text-[18px] leading-[1.55] text-stone-700">
                You store; you pay for storage. Reading what you put in costs nothing — no per-GB egress, no retrieval fees, no surprise bill on a busy weekend.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12">
            <PricingTeaser />
          </div>
        </div>
      </section>

      {/* 08 — Final CTA */}
      <PremiumCTA
        eyebrow="Get started"
        headline={
          <>
            Start a bucket
            <br />
            <span className="text-stone-500">in 30 seconds.</span>
          </>
        }
        sub="No card. 5 GB free forever. Bring the S3 client you already use."
        satellites={[
          {
            icon: BookOpen,
            label: "Read the docs",
            detail: "Quickstart, SDKs, full S3 compatibility map.",
            href: "/docs",
          },
          {
            icon: ScrollText,
            label: "See pricing",
            detail: "Predictable storage. No egress traps.",
            href: "/pricing",
          },
          {
            icon: MessageCircle,
            label: "Talk to sales",
            detail: "Custom regions, SSO, SLAs.",
            href: "mailto:hello@kraterion.com",
          },
        ]}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 px-4 py-2.5 text-[12px]">
      <dt className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </dt>
      <dd className="font-mono text-stone-800">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span
        className={`font-mono tabular-nums text-[14px] ${
          accent ? "text-krater" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
