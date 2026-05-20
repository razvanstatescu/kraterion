import { Hero } from "./Hero";
import { SectionFrame } from "./SectionFrame";
import { PillarBento } from "./PillarBento";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { BucketFlowRibbon } from "./BucketFlowRibbon";
import { S3ScrubBeatServer } from "./S3ScrubBeatServer";
import { AgentTools } from "./AgentTools";
import { EmbedSnippet } from "./EmbedSnippet";
import { OwnershipClaims } from "./OwnershipClaims";
import { SdkFanout } from "./visuals/SdkFanout";
import { BeforeAfterOwnership } from "./visuals/BeforeAfterOwnership";
import { UploadPipeline } from "./visuals/UploadPipeline";
import { MetricCard } from "./visuals/MetricCard";
import { PremiumCTA } from "./visuals/PremiumCTA";
import { BookOpen, ScrollText, MessageCircle } from "lucide-react";
import { TerminalSim, type TerminalLine } from "./TerminalSim";
import { PricingTeaser } from "./PricingTeaser";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "./rich/NumberedEyebrow";
import { StatStrip } from "./rich/StatStrip";
import { LogoMarquee } from "./rich/LogoMarquee";
import { BridgeHeadline } from "./rich/BridgeHeadline";
import { CustomerRail } from "./rich/CustomerRail";

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

const LOGOS = [
  "Quanta Labs",
  "Northhaven",
  "Atelier OS",
  "Loomstack",
  "Saltworks",
  "Pier 14",
  "Brightwell",
  "Kilnworks",
  "Mossridge",
  "Halecraft",
];

const STATS = [
  { value: "$0", label: "egress fees", sub: "Read what you store, free" },
  { value: "11", label: "S3 ops, fully compatible", sub: "boto3, aws-cli, rclone" },
  { value: "5 GB", label: "free, forever", sub: "No card required" },
  { value: "99.9%", label: "object durability", sub: "Erasure-coded across nodes" },
];

const CUSTOMERS = [
  {
    company: "Quanta Labs",
    metric: "4h → 22m",
    metricLabel: "Backup pipeline cut from four hours to twenty-two minutes.",
    chips: ["S3 API", "Multipart", "Pro"],
  },
  {
    company: "Northhaven",
    metric: "$0",
    metricLabel: "Egress bill the month they migrated off AWS S3.",
    chips: ["Storage", "S3 API", "Scale"],
  },
  {
    company: "Atelier OS",
    metric: "1 day",
    metricLabel: "From signup to a customer-facing chat over their docs bucket.",
    chips: ["Knowledge", "Embed", "Pro"],
  },
];

export function Landing() {
  return (
    <>
      <Hero />

      {/* Logo marquee */}
      <section className="border-y border-stone-200/60 bg-cream py-14">
        <div className="mx-auto max-w-[1280px] px-6">
          <p className="text-center text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
            Built by teams shipping at
          </p>
          <div className="mt-8">
            <LogoMarquee logos={LOGOS} />
          </div>
        </div>
      </section>

      {/* Stat strip */}
      <section className="bg-cream pt-24 pb-12 md:pt-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="00" label="At a glance" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Four numbers, no marketing math.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12">
            <StatStrip stats={STATS} />
          </div>
        </div>
      </section>

      {/* Pillars bento */}
      <SectionFrame
        eyebrow="01 — What you get"
        headline="Four parts, one bucket."
        lede="Storage, search, agents, and a chat widget — built so they reinforce each other, not so they sell as a bundle."
      >
        <PillarBento />
      </SectionFrame>

      {/* Bridge */}
      <BridgeHeadline align="left">
        Same SDK.
        <br />
        Same commands.
        <br />
        <span className="text-stone-500">The bucket lives somewhere new.</span>
      </BridgeHeadline>

      {/* S3 scrubbed beat */}
      <S3ScrubBeatServer tabs={S3_TABS} />

      {/* SDK fanout + upload pipeline */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01a" label="Ecosystem" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Every S3 client lands on the same endpoint.
              </h2>
              <p className="mt-6 max-w-[560px] text-[16px] text-stone-700">
                One URL. Eight first-class clients. No SDK rewrites.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
            <FadeUp>
              <SdkFanout />
            </FadeUp>
            <FadeUp delay={0.1} className="flex flex-col gap-4">
              <UploadPipeline />
              <div className="grid grid-cols-2 gap-4">
                <MetricCard value="11" label="S3 ops, supported" hint="Put, Get, List, Multipart…" />
                <MetricCard value="0 ms" label="rewrite needed" hint="One env var changes" />
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* Knowledge ribbon */}
      <section className="bg-ink text-cream">
        <div className="mx-auto max-w-[1280px] px-6 pt-24 pb-12">
          <NumberedEyebrow n="02" label="Knowledge layer" tone="ink" />
          <h2 className="mt-4 max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
            From file rows
            <br />
            to citations.
          </h2>
          <p className="mt-6 max-w-[640px] text-[18px] text-stone-300">
            Flip a switch on a bucket. We chunk, embed, retrieve, and bind every answer to a citation in your own files.
          </p>
        </div>
        <BucketFlowRibbon />
      </section>

      {/* Agents */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Agents" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                OpenAI-compatible.
                <br />
                <span className="text-stone-500">Your data, baked in.</span>
              </h2>
              <p className="mt-6 max-w-[560px] text-[18px] text-stone-700">
                Point any OpenAI client at /v1/agents/&#123;id&#125;. The agent runs over the bucket&apos;s index — tools, citations, quotas, all built in.
              </p>
            </div>
          </FadeUp>
          <div className="mt-16 grid items-stretch gap-4 md:grid-cols-[1.15fr_0.85fr]">
            <FadeUp className="flex">
              <div className="w-full">
                <CodeBlock tabs={AGENT_TABS} />
              </div>
            </FadeUp>
            <FadeUp delay={0.1} className="flex flex-col gap-4">
              {/* Agent metadata card */}
              <div className="hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
                <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
                  <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                    Agent · support
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-stone-600">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]" />
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <MetricCard value="0" label="vendor lock-in" hint="Drop-in OpenAI client" />
                <MetricCard value="5" label="built-in tools" hint="Override or extend" accent />
              </div>
            </FadeUp>
          </div>
          <div className="mt-12">
            <AgentTools />
          </div>
        </div>
      </section>

      {/* Customer rail */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-[640px]">
                <NumberedEyebrow n="04" label="In production" />
                <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                  Numbers from teams already shipping.
                </h2>
              </div>
              <a
                href="#"
                className="text-[14px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink"
              >
                Read customer stories →
              </a>
            </div>
          </FadeUp>
          <div className="mt-12">
            <CustomerRail cases={CUSTOMERS} />
          </div>
        </div>
      </section>

      {/* Embed widget beat */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 md:grid-cols-2 md:gap-16">
          <div className="flex flex-col justify-center">
            <FadeUp>
              <NumberedEyebrow n="05" label="Embed widget" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Drop a chat on any site. One line.
              </h2>
              <p className="mt-6 text-[16px] text-stone-700">
                Issue a share token. Paste the script tag. Your customers can ask questions; we bind answers to citations from the bucket you connect.
              </p>
            </FadeUp>
          </div>
          <FadeUp delay={0.1}>
            <EmbedSnippet />
          </FadeUp>
        </div>
      </section>

      {/* Ownership beat */}
      <section className="bg-ink text-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="06" label="Ownership" tone="ink" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Your data.
                <br />
                Your keys.
                <br />
                <span className="text-stone-500">Your exit.</span>
              </h2>
              <p className="mt-6 max-w-[560px] text-[18px] text-stone-300">
                Most storage products promise ownership in a marketing line. We make it a property of the system.
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

      {/* Developer quickstart */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="07" label="Quickstart" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Five lines to a queryable bucket.
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <TerminalSim lines={TERMINAL_LINES} interactive />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="08" label="Pricing" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                No egress traps.
              </h2>
              <p className="mt-6 text-[18px] text-stone-700">
                You store; you pay for storage. We don&apos;t penalize you for reading what you put in.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12">
            <PricingTeaser />
          </div>
        </div>
      </section>

      {/* Final CTA */}
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
          { icon: BookOpen, label: "Read the docs", detail: "Quickstart, SDKs, full S3 compatibility map.", href: "/docs" },
          { icon: ScrollText, label: "See pricing", detail: "Predictable storage. No egress traps.", href: "/pricing" },
          { icon: MessageCircle, label: "Talk to sales", detail: "Custom regions, SSO, SLAs.", href: "mailto:hello@kraterion.com" },
        ]}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 px-4 py-2.5 text-[12px]">
      <dt className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">{label}</dt>
      <dd className="font-mono text-stone-800">{value}</dd>
    </div>
  );
}
