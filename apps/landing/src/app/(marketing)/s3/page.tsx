import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { CompatibilityRow } from "@/components/marketing/CompatibilityRow";
import { RegionMap } from "@/components/marketing/visuals/RegionMap";
import { SdkFanout } from "@/components/marketing/visuals/SdkFanout";
import { UploadPipeline } from "@/components/marketing/visuals/UploadPipeline";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { BookOpen, ScrollText, Layers } from "lucide-react";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { StatStrip } from "@/components/marketing/rich/StatStrip";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";
import {
  DashboardChrome,
  BucketRow,
  FileRow,
} from "@/components/marketing/rich/DashboardSlice";
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

const S3_STATS = [
  { value: "11", label: "S3 ops, fully compatible", sub: "Put / Get / List / Multipart" },
  { value: "4", label: "official client libraries", sub: "boto3, JS SDK, rclone, aws-cli" },
  { value: "0", label: "egress fees", sub: "Pull what you put in, free" },
  { value: "100%", label: "drop-in", sub: "One env var changes" },
];

export default function Page() {
  return (
    <>
      {/* Hero — copy left, live dashboard right */}
      <section className="relative overflow-hidden bg-cream pt-40 pb-24">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-12 px-6 md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <FadeUp>
              <NumberedEyebrow n="S3" label="API & SDKs" />
              <h1 className="mt-6 max-w-[680px] text-[44px] leading-[1.05] tracking-[-0.02em] md:text-[80px]">
                Speak S3
                <br />
                <span className="text-stone-500">from day one.</span>
              </h1>
              <p className="mt-8 max-w-[560px] text-[18px] text-stone-700">
                Point any S3 client at our endpoint. boto3, aws-cli, rclone, MinIO Client — all work today.
              </p>
              <div className="mt-10 flex items-center gap-6">
                <ButtonLink href="/signup" variant="primary" size="lg">Start free →</ButtonLink>
                <a href="/docs/quickstart" className="text-[15px] underline underline-offset-4 decoration-stone-400 hover:decoration-ink">
                  Quickstart
                </a>
              </div>
            </FadeUp>
          </div>
          <FadeUp delay={0.2}>
            <DashboardChrome url="app.kraterion.com" path="/buckets">
              <div className="bg-cream">
                <BucketRow
                  name="assets-prod"
                  objects="4,812 objects"
                  size="24.6 GB"
                  access="public-read"
                  created="18 days ago"
                />
                <BucketRow
                  name="model-eval-runs"
                  objects="142 objects"
                  size="2.4 GB"
                  access="private"
                  created="6 days ago"
                />
                <BucketRow
                  name="support-tickets"
                  objects="9,103 objects"
                  size="384 MB"
                  access="team"
                  created="2 days ago"
                  highlight
                />
                <BucketRow
                  name="marketing-assets"
                  objects="282 objects"
                  size="6.8 GB"
                  access="public-read"
                  created="just now"
                />
              </div>
            </DashboardChrome>
          </FadeUp>
        </div>
      </section>

      {/* Stat strip */}
      <section className="bg-cream pb-24">
        <div className="mx-auto max-w-[1280px] px-6">
          <StatStrip stats={S3_STATS} />
        </div>
      </section>

      {/* Drop-in story */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="Drop-in" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[56px]">
                Change one variable.
                <br />
                <span className="text-stone-500">Keep your stack.</span>
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 grid gap-8 md:grid-cols-2">
              <CodeBlock tabs={FULL_TABS} />
              <SdkFanout />
            </div>
          </FadeUp>
          <FadeUp delay={0.15}>
            <div className="mt-8">
              <UploadPipeline />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Endpoints */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Endpoints & regions" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Pick a region. Get an endpoint.
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <RegionMap />
            </div>
          </FadeUp>
          <FadeUp delay={0.15}>
            <div className="mt-8 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <div className="grid grid-cols-[1fr_2fr_auto] gap-4 border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                <span>Region</span>
                <span>Endpoint</span>
                <span>Status</span>
              </div>
              {REGIONS.map((r) => (
                <div
                  key={r.region}
                  className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 border-b border-stone-200/60 px-4 py-3 text-[14px] last:border-b-0 hover:bg-stone-50"
                >
                  <span className="text-ink">{r.region}</span>
                  <code className="font-mono text-[13px] text-stone-700">{r.endpoint}</code>
                  <span className="inline-flex items-center gap-2 text-[12px] text-stone-600">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: "#5C7A3F" }} />
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Compatibility */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Compatibility" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                What works. What&apos;s partial. What&apos;s on the way.
              </h2>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              {COMPAT.map((c) => (
                <CompatibilityRow key={c.feature} {...c} />
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      <BridgeHeadline align="left">
        Move in over a weekend.
        <br />
        <span className="text-stone-500">Or one terminal session.</span>
      </BridgeHeadline>

      {/* Migration */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Migration" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Three ways in.
              </h2>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-12 md:grid-cols-[1fr_1.2fr]">
            <FadeUp className="flex flex-col gap-8">
              <MigStep
                n="01"
                title="Point your client at us"
              >
                Set <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">AWS_ENDPOINT_URL</code> to{" "}
                <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">s3.kraterion.com</code>.
              </MigStep>
              <MigStep
                n="02"
                title="We pull from your origin on first read"
              >
                First request streams through. Subsequent reads serve from our edge.
              </MigStep>
              <MigStep
                n="03"
                title="Or rclone-sync if you want it done in a day"
              >
                Reliable, resumable, and quiet.
              </MigStep>
            </FadeUp>
            <FadeUp delay={0.1}>
              <div className="mt-8 md:mt-0">
                <CodeBlock tabs={MIGRATION_TABS} />
              </div>
              <FadeUp delay={0.2}>
                <div className="mt-6 hairline overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
                  <div className="border-b border-stone-200/60 bg-stone-50 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                    Live transfer · old-bucket → my-bucket
                  </div>
                  <FileRow icon="file" name="dataset-2026-04.parquet" size="2.1 GB" status="sealed" />
                  <FileRow icon="file" name="model-checkpoint-v12.pt" size="486 MB" status="sealed" />
                  <FileRow icon="file" name="logs/2026-05.tar.gz" size="38 MB" status="encrypting" />
                  <FileRow icon="file" name="metrics/q1-export.csv" size="412 KB" status="uploading" />
                </div>
              </FadeUp>
            </FadeUp>
          </div>
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
        sub="One environment variable changes. Everything else stays the same."
        satellites={[
          { icon: BookOpen, label: "Quickstart", detail: "Five lines to a queryable bucket.", href: "/docs/quickstart" },
          { icon: Layers, label: "Compatibility", detail: "What works, what's partial, what's roadmap.", href: "#" },
          { icon: ScrollText, label: "Pricing", detail: "Egress costs less than nothing.", href: "/pricing" },
        ]}
      />
    </>
  );
}

function MigStep({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-6">
      <span className="font-mono text-[14px] tabular-nums text-krater shrink-0 mt-1">{n}</span>
      <div>
        <h3 className="text-[20px] leading-[1.2] font-medium text-ink">{title}</h3>
        <p className="mt-2 text-[14px] leading-[1.6] text-stone-700">{children}</p>
      </div>
    </div>
  );
}
