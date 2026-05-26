import type { Metadata } from "next";
import { Check, Minus, Clock } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { FadeUp } from "@/components/motion/FadeUp";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { PremiumCTA } from "@/components/marketing/visuals/PremiumCTA";
import { StorageSchema } from "@/components/marketing/visuals/StorageSchema";
import { BookOpen, ScrollText, Layers } from "lucide-react";
import { NumberedEyebrow } from "@/components/marketing/rich/NumberedEyebrow";
import { BridgeHeadline } from "@/components/marketing/rich/BridgeHeadline";

export const dynamic = "force-static";

const OG = "/api/og?surface=S3%20API%20%26%20SDKs&title=Speak%20S3%20from%20day%20one.";

export const metadata: Metadata = {
  title: "S3 API & SDKs — Kraterion",
  description:
    "Speak S3 from day one. Point any S3 client at our endpoint — boto3, aws-cli, rclone, JS SDK all work today.",
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
s3.upload_file("photo.jpg", "my-bucket", "photo.jpg")
print(s3.list_objects_v2(Bucket="my-bucket"))`,
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

/**
 * Compatibility table — verified against the actual gateway in
 * apps/gateway/src/s3/*. Honest about what's full, partial, and roadmap.
 */
type Support = "full" | "partial" | "roadmap";
const COMPAT: { feature: string; support: Support; note?: string }[] = [
  { feature: "PutObject / GetObject / HeadObject / DeleteObject", support: "full" },
  { feature: "ListObjectsV2", support: "full" },
  { feature: "CreateBucket / DeleteBucket / HeadBucket / ListBuckets", support: "full" },
  { feature: "SigV4 signing (header + presigned URL)", support: "full" },
  { feature: "Public-read buckets (anonymous GET / HEAD)", support: "full" },
  { feature: "Path-style addressing (bucket in the path)", support: "full" },
  { feature: "Server-side encryption (always-on AES256)", support: "full", note: "Returns x-amz-server-side-encryption: AES256; sealing is client-side via Seal" },
  { feature: "Virtual-hosted addressing (bucket.s3.kraterion.com)", support: "partial", note: "Localhost-shaped origins today; production-domain wildcards next" },
  { feature: "Multipart uploads (CreateMultipartUpload / UploadPart)", support: "roadmap", note: "Single-PUT works up to the Walrus 13 GiB blob ceiling" },
  { feature: "Lifecycle rules", support: "roadmap" },
  { feature: "Bucket versioning", support: "roadmap" },
  { feature: "Object Lock", support: "roadmap" },
  { feature: "CORS configuration", support: "roadmap" },
  { feature: "S3 Select", support: "roadmap" },
  { feature: "Replication", support: "roadmap" },
];

export default function Page() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-cream pt-24 pb-16 md:pt-32 md:pb-20">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[860px]">
              <NumberedEyebrow n="S3" label="API & SDKs" />
              <h1 className="mt-6 text-[40px] leading-[1.04] tracking-[-0.02em] text-ink md:text-[60px] md:leading-[1.02]">
                Speak S3
                <br />
                <span className="text-stone-500">from day one.</span>
              </h1>
              <p className="mt-6 max-w-[560px] text-[17px] leading-[1.55] text-stone-700 md:text-[18px]">
                Point any S3 client at our endpoint. boto3, aws-cli, rclone, the AWS SDKs — all work today against the same gateway, with sealed objects and on-chain ownership underneath.
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
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Request lifecycle — the full schema */}
      <section className="bg-cream pb-24 md:pb-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="01" label="Request lifecycle" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                One endpoint.
                <br />
                <span className="text-stone-500">Three back-end concerns.</span>
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Same surface, different spine. Your S3 client hits a single gateway endpoint; we orchestrate Seal (encryption), Walrus (storage), and Sui (identity + audit) in parallel.
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

      {/* Drop-in code */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="02" label="Drop-in" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[48px]">
                Change one env var. Keep your stack.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Set <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">AWS_ENDPOINT_URL</code> to <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">s3.kraterion.com</code>. Re-run your code. Done.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12">
              <CodeBlock tabs={FULL_TABS} />
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Compatibility — honest table */}
      <section className="bg-cream py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="03" label="Compatibility" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                What works. What&apos;s partial. What&apos;s on the roadmap.
              </h2>
              <p className="mt-6 max-w-[640px] text-[16px] leading-[1.55] text-stone-700">
                Honest map of the surface — what your existing client will exercise today, what's a known gap, and what's already on the queue.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <div className="grid grid-cols-[1fr_120px] items-center gap-4 border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                <span>Feature</span>
                <span>Status</span>
              </div>
              {COMPAT.map((c, i) => (
                <div
                  key={c.feature}
                  className={`grid grid-cols-[1fr_120px] items-start gap-4 px-4 py-3 text-[13px] hover:bg-stone-50 ${
                    i < COMPAT.length - 1 ? "border-b border-stone-200/60" : ""
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-ink">{c.feature}</span>
                    {c.note && (
                      <span className="font-mono text-[11px] text-stone-500">{c.note}</span>
                    )}
                  </div>
                  <SupportPill support={c.support} />
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* Region honesty — single region today */}
      <section className="bg-stone-50 py-24 md:py-32">
        <div className="mx-auto max-w-[1280px] px-6">
          <FadeUp>
            <div className="max-w-[760px]">
              <NumberedEyebrow n="04" label="Endpoint & regions" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                One region today.
                <br />
                <span className="text-stone-500">Multi-region next.</span>
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                We're shipping out of <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px] text-stone-700">eu-central-1</code> while we run a private beta. Multi-region routing follows after the public launch — talk to us if you need a specific region first.
              </p>
            </div>
          </FadeUp>
          <FadeUp delay={0.1}>
            <div className="mt-12 overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
              <div className="grid grid-cols-[1fr_2fr_auto] gap-4 border-b border-stone-200/60 bg-stone-50 px-4 py-3 text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
                <span>Region</span>
                <span>Endpoint</span>
                <span>Status</span>
              </div>
              <div className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 border-b border-stone-200/60 px-4 py-3 text-[14px]">
                <span className="text-ink">eu-central-1</span>
                <code className="font-mono text-[13px] text-stone-700">https://s3.kraterion.com</code>
                <span className="inline-flex items-center gap-2 text-[12px] text-stone-600">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]"
                  />
                  Operational
                </span>
              </div>
              <div className="grid grid-cols-[1fr_2fr_auto] items-center gap-4 px-4 py-3 text-[14px]">
                <span className="text-stone-500">us-east-1, ap-southeast-1</span>
                <code className="font-mono text-[13px] text-stone-500">—</code>
                <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-stone-500">
                  <Clock size={11} strokeWidth={1.5} />
                  roadmap
                </span>
              </div>
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
              <NumberedEyebrow n="05" label="Migration" />
              <h2 className="mt-4 text-[32px] leading-[1.1] tracking-[-0.01em] md:text-[44px]">
                Two paths in.
              </h2>
              <p className="mt-6 max-w-[620px] text-[16px] leading-[1.55] text-stone-700">
                Either point your client at us and let new writes land here, or run a one-shot sync from your old bucket. No proprietary import tool — both paths use the standard S3 ecosystem.
              </p>
            </div>
          </FadeUp>
          <div className="mt-12 grid gap-12 md:grid-cols-[1fr_1.2fr]">
            <FadeUp className="flex flex-col gap-8">
              <MigStep n="01" title="Repoint your client">
                Set <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">AWS_ENDPOINT_URL</code> to{" "}
                <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">s3.kraterion.com</code>. New uploads land on Kraterion, old reads keep going to the old bucket until you cut over.
              </MigStep>
              <MigStep n="02" title="Or run a one-shot sync">
                <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">rclone sync</code> or <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[12px] text-stone-700">aws s3 sync</code> with two endpoint flags. Reliable, resumable, idempotent.
              </MigStep>
              <MigStep n="03" title="Leave whenever, the same way">
                Reverse the flags. Every byte stored as a plain object you can pull through any S3 client — no proprietary export step.
              </MigStep>
            </FadeUp>
            <FadeUp delay={0.1}>
              <CodeBlock tabs={MIGRATION_TABS} />
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
        primaryHref="mailto:hello@kraterion.com?subject=Beta%20access%20request"
        primaryLabel="Get early access →"
        sub="One environment variable changes. Everything else stays the same."
        satellites={[
          { icon: BookOpen, label: "Quickstart", detail: "Five lines to a sealed bucket.", href: "/docs/quickstart" },
          { icon: Layers, label: "Compatibility", detail: "What works, what's partial, what's roadmap.", href: "#" },
          { icon: ScrollText, label: "Pricing", detail: "Cheap egress, real free band, no tier surprises.", href: "/pricing" },
        ]}
      />
    </>
  );
}

function SupportPill({ support }: { support: Support }) {
  if (support === "full") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/[0.06] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[color:var(--color-success)]">
        <Check size={11} strokeWidth={2} />
        Full
      </span>
    );
  }
  if (support === "partial") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-sm border border-krater/30 bg-krater/[0.05] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-krater">
        <Minus size={11} strokeWidth={2} />
        Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-stone-200/60 bg-stone-50 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-stone-500">
      <Clock size={11} strokeWidth={1.5} />
      Roadmap
    </span>
  );
}

function MigStep({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-6">
      <span className="font-mono text-[14px] tabular-nums text-krater shrink-0 mt-1">
        {n}
      </span>
      <div>
        <h3 className="text-[20px] leading-[1.2] font-medium text-ink">{title}</h3>
        <p className="mt-2 text-[14px] leading-[1.6] text-stone-700">{children}</p>
      </div>
    </div>
  );
}
