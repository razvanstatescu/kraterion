import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { SectionFrame } from "@/components/marketing/SectionFrame";
import { CompatibilityRow } from "@/components/marketing/CompatibilityRow";
import { REGIONS, COMPAT } from "@/lib/mock/s3";

export const dynamic = "force-static";

const OG = "/api/og?surface=S3%20API%20%26%20SDKs&title=Speak%20S3%20from%20day%20one.";

export const metadata: Metadata = {
  title: "S3 API & SDKs — Kraterion",
  description:
    "Speak S3 from day one. Point any S3 client at our endpoint. boto3, aws-cli, rclone, MinIO Client all work today.",
  openGraph: { images: [OG] },
  twitter: { images: [OG] },
};

const FULL_TABS = [
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

export default function Page() {
  return (
    <>
      <section className="relative overflow-hidden bg-cream pt-40 pb-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <p className="micro text-stone-500">S3 API & SDKs</p>
            <h1 className="mt-4 max-w-[840px] text-[40px] leading-[1.05] tracking-[-0.02em] md:text-[72px]">
              Speak S3 from day one.
            </h1>
            <p className="mt-8 max-w-[640px] text-[18px] text-stone-700">
              Point any S3 client at our endpoint. We do the rest.
            </p>
            <div className="mt-10 flex items-center gap-6">
              <ButtonLink href="/signup" variant="primary" size="lg">Start free →</ButtonLink>
              <a href="/docs/quickstart" className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
                Quickstart
              </a>
            </div>
          </FadeUp>
        </div>
      </section>

      <SectionFrame
        eyebrow="Drop-in"
        headline="Same SDK. Same commands."
        lede="Change one environment variable. Everything else stays the same."
      >
        <CodeBlock tabs={FULL_TABS} />
      </SectionFrame>

      <SectionFrame
        eyebrow="Endpoints & regions"
        headline="Pick a region, get an endpoint."
      >
        <div className="overflow-hidden rounded-lg border border-stone-200/60">
          <div className="grid grid-cols-[1fr_2fr_auto] gap-4 border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] text-stone-500">
            <span>Region</span>
            <span>Endpoint</span>
            <span>Status</span>
          </div>
          {REGIONS.map((r) => (
            <div
              key={r.region}
              className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 border-b border-stone-200/60 px-4 py-3 text-[14px] last:border-b-0"
            >
              <span className="text-ink">{r.region}</span>
              <code className="text-[13px] text-stone-600">{r.endpoint}</code>
              <span className="inline-flex items-center gap-2 text-[12px] text-stone-600">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "#5C7A3F" }} />
                {r.status}
              </span>
            </div>
          ))}
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="Compatibility"
        headline="What works, what's partial, what's on the way."
      >
        <div className="overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
          {COMPAT.map((c) => (
            <CompatibilityRow key={c.feature} {...c} />
          ))}
        </div>
      </SectionFrame>

      <SectionFrame
        eyebrow="Migration"
        headline="Move in over a weekend."
        lede="Point your client at us, run sync, walk away. Or stream from your origin on first read — we cache."
      >
        <div className="grid gap-12 md:grid-cols-[1fr_1.2fr]">
          <FadeUp className="flex flex-col gap-6">
            <Step n={1} title="Point your client at us">
              Set <code className="font-mono text-[13px] text-stone-700">AWS_ENDPOINT_URL</code> to <code className="font-mono text-[13px] text-stone-700">https://s3.kraterion.com</code>.
            </Step>
            <Step n={2} title="We pull from your origin on first read">
              First request streams through. Subsequent reads serve from our edge.
            </Step>
            <Step n={3} title="Or rclone-sync if you want to be done in a day">
              Reliable, resumable, and quiet.
            </Step>
          </FadeUp>
          <FadeUp delay={0.1}>
            <CodeBlock tabs={MIGRATION_TABS} />
          </FadeUp>
        </div>
      </SectionFrame>

      <section className="bg-cream">
        <div className="mx-auto max-w-[1280px] px-6 py-32 text-center">
          <FadeUp>
            <h2 className="mx-auto max-w-[760px] text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
              Point a client at us, see for yourself.
            </h2>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-10 flex justify-center">
              <ButtonLink href="/signup" variant="primary" size="lg">
                Start free →
              </ButtonLink>
            </div>
          </FadeUp>
        </div>
      </section>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-stone-200/60 text-[13px] font-medium text-stone-600">
        {n}
      </span>
      <div>
        <h3 className="text-[18px] font-medium text-ink">{title}</h3>
        <p className="mt-2 text-[14px] text-stone-700">{children}</p>
      </div>
    </div>
  );
}
