import { Hero } from "./Hero";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { BucketFlowRibbon } from "./BucketFlowRibbon";
import { S3ScrubBeatServer } from "./S3ScrubBeatServer";
import { AgentRunPanel } from "./AgentRunPanel";
import { MCPCallout } from "./MCPCallout";
import { OwnershipClaims } from "./OwnershipClaims";
import { BeforeAfterOwnership } from "./visuals/BeforeAfterOwnership";
import { PremiumCTA } from "./visuals/PremiumCTA";
import { StorageSchema } from "./visuals/StorageSchema";
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
    lang: "typescript",
    filename: "openai.ts",
    code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.kraterion.com/v1/agents/support",
  apiKey: process.env.KRATERION_KEY,
});

const reply = await client.chat.completions.create({
  model: "support",
  messages: [
    { role: "user", content: "What is our refund policy?" },
  ],
});

console.log(reply.choices[0].message.content);
// → Refunds are processed within 7 business days
//   from the original payment method.
//
// citations: [pricing-faq.md · §3 · 0.92]`,
  },
  {
    lang: "python",
    filename: "openai.py",
    code: `import os
from openai import OpenAI

client = OpenAI(
    base_url="https://api.kraterion.com/v1/agents/support",
    api_key=os.environ["KRATERION_KEY"],
)

reply = client.chat.completions.create(
    model="support",
    messages=[
        {"role": "user", "content": "What is our refund policy?"},
    ],
)

print(reply.choices[0].message.content)
# → Refunds are processed within 7 business days
#   from the original payment method.
#
# citations: [pricing-faq.md · §3 · 0.92]`,
  },
  {
    lang: "bash",
    filename: "curl",
    code: `curl https://api.kraterion.com/v1/agents/support/chat/completions \\
  -H "Authorization: Bearer $KRATERION_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "support",
    "messages": [
      {"role": "user", "content": "What is our refund policy?"}
    ]
  }'`,
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
                Point any S3 client at us — boto3, aws-cli, rclone, the SDKs. The bytes are stored as plain objects you can pull from any region. Leaving means walking out with your files at ~9× lower egress than AWS — not paying a tax to do it.
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
          <div className="mt-12 grid items-stretch gap-4 md:grid-cols-2">
            <FadeUp className="flex">
              <div className="flex w-full">
                <CodeBlock tabs={AGENT_TABS} className="w-full min-h-[440px]" />
              </div>
            </FadeUp>
            <FadeUp delay={0.1} className="flex">
              <AgentRunPanel className="w-full" />
            </FadeUp>
          </div>
          <div className="mt-20">
            <MCPCallout />
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
                Egress is $0.01/GB with a 50 GB monthly free band — about 9× cheaper than AWS S3, and a flat rate above the free band. No tiered penalties, no surprise bill when a weekend goes viral.
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

