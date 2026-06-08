import { Hero } from "./Hero";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { BucketFlowRibbon } from "./BucketFlowRibbon";
import { S3ScrubBeatServer } from "./S3ScrubBeatServer";
import { AgentRunPanel } from "./AgentRunPanel";
import { MCPCallout } from "./MCPCallout";
import { RuntimeCapabilities } from "./RuntimeCapabilities";
import { HowItsBuilt } from "./HowItsBuilt";
import { ComplianceTeaser } from "./ComplianceTeaser";
import { OwnershipClaims } from "./OwnershipClaims";
import { BeforeAfterOwnership } from "./visuals/BeforeAfterOwnership";
import { PremiumCTA } from "./visuals/PremiumCTA";
import { StorageSchema } from "./visuals/StorageSchema";
import { BookOpen, ScrollText, MessageCircle } from "lucide-react";
import { TerminalSim, type TerminalLine } from "./TerminalSim";
import { PricingCalculator } from "./PricingCalculator";
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

const RUNTIME_TABS = [
  {
    lang: "python",
    filename: "langgraph.py",
    code: `from langgraph.graph import StateGraph
from kraterion.langgraph import WalrusCheckpointSaver

# Point your existing graph's checkpointer at Kraterion.
# Every run records itself — replayable, auditable, yours.
graph = builder.compile(
    checkpointer=WalrusCheckpointSaver(project="support"),
)

result = graph.invoke({"question": "What is our refund policy?"})
# run recorded · receipt 3f4d…ae · replay with: kraterion replay 3f4d…ae`,
  },
  {
    lang: "typescript",
    filename: "vercel-ai-sdk.ts",
    code: `import { generateText } from "ai";
import { withKraterion } from "@kraterion/ai-sdk";

// Wrap any model. No other change to your agent.
const model = withKraterion(openai("gpt-4o"), { project: "support" });

const { text } = await generateText({
  model,
  prompt: "What is our refund policy?",
});
// run recorded · receipt 3f4d…ae · replay any past run from its receipt`,
  },
  {
    lang: "typescript",
    filename: "openai.ts",
    code: `import OpenAI from "openai";

// Already OpenAI-compatible — just swap the base URL.
const client = new OpenAI({
  baseURL: "https://api.kraterion.com/v1/agents/support",
  apiKey: process.env.KRATERION_KEY,
});

const reply = await client.chat.completions.create({
  model: "support",
  messages: [{ role: "user", content: "What is our refund policy?" }],
});
// → Refunds are processed within 7 business days.
// citations: [pricing-faq.md · §3 · 0.92] · run recorded`,
  },
];

const TERMINAL_LINES: TerminalLine[] = [
  { kind: "prompt", text: "pip install kraterion" },
  { kind: "prompt", text: "export KRATERION_KEY=kr_live_..." },
  { kind: "prompt", text: "python support_agent.py   # one import added" },
  { kind: "output", text: "✓ run recorded · receipt 3f4d…ae" },
  { kind: "prompt", text: "kraterion replay 3f4d…ae" },
  { kind: "success", text: "✓ replay matches original · verified" },
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
                What breaks when you ship an agent.
              </h2>
              <p className="mt-6 max-w-[640px] text-[18px] leading-[1.55] text-stone-700">
                Agents are non-deterministic. When one goes wrong in production, you need to see what it did, reproduce the run, and prove it — and most tools can&apos;t give you that.
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
        Run your agent.
        <br />
        <span className="text-stone-500">Keep the receipts.</span>
      </BridgeHeadline>

      {/* 02 — Storage (the foundation the runtime sits on) */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="The foundation" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Storage you own.
                <br />
                <span className="text-stone-500">The runtime sits on top.</span>
              </h2>
              <p className="mt-6 max-w-[600px] text-[18px] leading-[1.55] text-stone-700">
                Every file, knowledge base, run record, and memory lives in storage you own — S3-compatible, so boto3, aws-cli, and rclone work unchanged. Bring your data in, and the runtime records itself right beside it.
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
              Retrieval you can check.
            </>
          }
          lede="Flip one toggle and your files become a knowledge base. Hybrid retrieval — BM25 plus dense vectors, top-k 8. Every answer carries a citation you can verify against the exact source it came from."
        />
      </section>

      {/* 04 — The runtime */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="The runtime" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Wrap your agent.
                <br />
                <span className="text-stone-500">Replay any run.</span>
              </h2>
              <p className="mt-6 max-w-[600px] text-[18px] leading-[1.55] text-stone-700">
                Wrap a LangGraph or Vercel AI SDK agent with one import — or point your OpenAI client at us. From then on, every retrieval, tool call, and memory write is recorded automatically, with nothing else to wire up.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid items-stretch gap-4 md:grid-cols-2">
            <FadeUp className="flex">
              <div className="flex w-full">
                <CodeBlock tabs={RUNTIME_TABS} className="w-full min-h-[440px]" />
              </div>
            </FadeUp>
            <FadeUp delay={0.1} className="flex">
              <AgentRunPanel className="w-full" />
            </FadeUp>
          </div>

          {/* Runtime capabilities — links into the deep-dive pages */}
          <FadeUp delay={0.1}>
            <div className="mt-16">
              <p className="mb-6 max-w-[600px] text-[16px] leading-[1.55] text-stone-700">
                That recorded run is the foundation for everything else — replay it, trace any output back to its sources, or give the agent memory it can reach for.
              </p>
              <RuntimeCapabilities />
            </div>
          </FadeUp>

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
                Your logs.
                <br />
                <span className="text-stone-500">Your exit.</span>
              </h2>
              <p className="mt-6 max-w-[600px] text-[18px] leading-[1.55] text-stone-300">
                Observability tools hold your traces in their database — mutable, sampled, on their retention clock. Kraterion keeps every file and every run record in storage you own. Encrypted by default, verifiable by anyone, and yours to take with you.
              </p>
            </div>
          </FadeUp>
          <div className="mt-16">
            <BeforeAfterOwnership />
          </div>
          <FadeUp>
            <p className="mt-16 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
              What that gets you
            </p>
          </FadeUp>
          <div className="mt-6">
            <OwnershipClaims />
          </div>
        </div>
      </section>

      {/* 05 — How it's built */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="05" label="How it's built" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Built on infrastructure you own.
              </h2>
              <p className="mt-6 max-w-[640px] text-[18px] leading-[1.55] text-stone-700">
                Ownership isn&apos;t a policy here — it&apos;s the stack. Each part runs on open infrastructure you can verify and walk away with.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <HowItsBuilt />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* 06 — Built for the rules */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="06" label="Compliance" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Built for the rules AI is facing.
              </h2>
              <p className="mt-6 max-w-[640px] text-[18px] leading-[1.55] text-stone-700">
                AI regulation keeps asking the same things — show what your AI did, keep the record, control the data. The way Kraterion is built answers all three.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <ComplianceTeaser />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* 07 — Quickstart */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[640px]">
              <NumberedEyebrow n="07" label="Quickstart" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Five lines to a replayable agent.
              </h2>
              <p className="mt-6 text-[16px] leading-[1.55] text-stone-700">
                Wrap an agent you already have. Run it, and Kraterion records the run. Replay it from its receipt — same inputs, same retrieval.
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

      {/* 08 — Pricing */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="08" label="Pricing" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Pay for what you use.
              </h2>
              <p className="mt-6 max-w-[620px] text-[18px] leading-[1.55] text-stone-700">
                Storage, retrieval, and run records on the same meter — generous free band on each, flat per-unit rate above it, no minimums or tier cliffs. Bring your own model keys; we don&apos;t mark up tokens.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <PricingCalculator />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* 08 — Final CTA */}
      <PremiumCTA
        eyebrow="Get early access"
        headline={
          <>
            Ship agents you can
            <br />
            <span className="text-stone-500">debug, reproduce, and trust.</span>
          </>
        }
        primaryHref="mailto:hello@kraterion.com?subject=Beta%20access%20request"
        primaryLabel="Request beta access →"
        sub="No card. Free band on every meter. Wrap an agent you already have."
        satellites={[
          {
            icon: BookOpen,
            label: "Read the docs",
            detail: "Quickstart, the SDKs, and the replay API.",
            href: "/docs",
          },
          {
            icon: ScrollText,
            label: "See pricing",
            detail: "Storage, retrieval, and runs on one meter.",
            href: "/pricing",
          },
          {
            icon: MessageCircle,
            label: "Talk to us",
            detail: "Volume pricing, self-hosting, beta access.",
            href: "mailto:hello@kraterion.com",
          },
        ]}
      />
    </>
  );
}

