import { Hero } from "./Hero";
import { SocialProof } from "./SocialProof";
import { SectionFrame } from "./SectionFrame";
import { PillarGrid } from "./PillarGrid";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { BucketFlowRibbon } from "./BucketFlowRibbon";
import { S3ScrubBeatServer } from "./S3ScrubBeatServer";
import { AgentTools } from "./AgentTools";
import { EmbedSnippet } from "./EmbedSnippet";
import { OwnershipClaims } from "./OwnershipClaims";
import { TerminalSim, type TerminalLine } from "./TerminalSim";
import { PricingTeaser } from "./PricingTeaser";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";

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
  -d '{"messages":[{"role":"user","content":"What's our refund policy?"}]}'`,
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
  messages: [{ role: "user", content: "What's our refund policy?" }],
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

export function Landing() {
  return (
    <>
      <Hero />
      <SocialProof />

      {/* Pillars */}
      <SectionFrame
        eyebrow="What you get"
        headline="Four parts, one bucket."
        lede="Storage, search, agents, and a chat widget — built so they reinforce each other, not so they sell as a bundle."
      >
        <PillarGrid />
      </SectionFrame>

      {/* S3 deep beat — pinned, scrubbed */}
      <S3ScrubBeatServer tabs={S3_TABS} />

      {/* Knowledge ribbon — pinned, scrubbed */}
      <section className="bg-ink text-cream">
        <div className="mx-auto max-w-[1280px] px-6 pt-24 pb-12">
          <p className="micro text-stone-400">Knowledge layer</p>
          <h2 className="mt-4 max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
            From file rows to citations.
          </h2>
          <p className="mt-6 max-w-[760px] text-[18px] text-stone-300">
            Flip a switch on a bucket. We chunk, embed, retrieve, and bind every answer to a citation in your own files.
          </p>
        </div>
        <BucketFlowRibbon />
      </section>

      {/* Agents */}
      <SectionFrame
        eyebrow="Agents"
        headline="OpenAI-compatible, with your data baked in."
        lede="Point any OpenAI client at /v1/agents/{id} and your agent runs over the bucket's index. Tools, citations, quotas, all built in."
      >
        <div className="grid gap-12">
          <CodeBlock tabs={AGENT_TABS} />
          <AgentTools />
        </div>
      </SectionFrame>

      {/* Embed widget beat */}
      <section className="bg-stone-50">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 py-24 md:grid-cols-2 md:gap-16 md:py-32">
          <div className="flex flex-col justify-center">
            <FadeUp>
              <p className="micro text-stone-500">Embed widget</p>
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
      <SectionFrame
        tone="ink"
        eyebrow="Ownership"
        headline="Your data. Your keys. Your exit."
        lede="Most storage products promise ownership in a marketing line. We make it a property of the system."
      >
        <OwnershipClaims />
      </SectionFrame>

      {/* Developer quickstart */}
      <SectionFrame
        eyebrow="Quickstart"
        headline="Five lines to a queryable bucket."
        lede="Same SDK. Same commands. The bucket lives somewhere new."
      >
        <FadeUp>
          <TerminalSim lines={TERMINAL_LINES} interactive />
        </FadeUp>
      </SectionFrame>

      {/* Pricing teaser */}
      <SectionFrame
        eyebrow="Pricing"
        headline="No egress traps."
        lede="You store; you pay for storage. We don't penalize you for reading what you put in."
      >
        <PricingTeaser />
      </SectionFrame>

      {/* Final CTA */}
      <section className="bg-cream">
        <div className="mx-auto max-w-[1280px] px-6 py-32 text-center">
          <FadeUp>
            <h2 className="mx-auto max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
              Start a bucket in 30 seconds.
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-10 flex justify-center">
              <ButtonLink href="/signup" variant="primary" size="lg">
                Start free →
              </ButtonLink>
            </div>
          </FadeUp>
          <FadeUp delay={0.15}>
            <p className="mt-6 text-[14px] text-stone-600">No card. 5 GB free forever.</p>
          </FadeUp>
        </div>
      </section>
    </>
  );
}
