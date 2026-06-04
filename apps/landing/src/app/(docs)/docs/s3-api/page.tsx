import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Buckets & S3 API — Kraterion docs",
  description:
    "Kraterion's S3-compatible storage API: SigV4 auth, the operations that are supported, what isn't, size caps, public buckets, and error codes.",
};

const HEADINGS = [
  { id: "endpoint", label: "Endpoint", level: 2 as const },
  { id: "authentication", label: "Authentication", level: 2 as const },
  { id: "supported-operations", label: "Supported operations", level: 2 as const },
  { id: "unsupported", label: "Not supported", level: 2 as const },
  { id: "acl-and-visibility", label: "ACL & visibility", level: 2 as const },
  { id: "size-caps", label: "Size caps", level: 2 as const },
  { id: "public-urls", label: "Public buckets", level: 2 as const },
  { id: "errors", label: "Errors", level: 2 as const },
];

const OPS = [
  ["ListBuckets", "GET /", "List your buckets."],
  ["HeadBucket", "HEAD /:bucket", "Check a bucket exists."],
  ["DeleteBucket", "DELETE /:bucket", "Delete an empty bucket."],
  ["ListObjectsV2", "GET /:bucket?list-type=2", "List objects (V2 only)."],
  ["GetObject", "GET /:bucket/:key", "Download and decrypt an object."],
  ["HeadObject", "HEAD /:bucket/:key", "Object metadata without the body."],
  ["PutObject", "PUT /:bucket/:key", "Encrypt and store an object."],
  ["DeleteObject", "DELETE /:bucket/:key", "Delete an object (idempotent)."],
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Storage</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Buckets &amp; S3 API
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Kraterion exposes an S3-compatible API, so existing S3 clients —
          boto3, the AWS CLI, rclone — work against it. It implements the core
          object operations; some S3 surface area is intentionally left out.
        </p>

        <h2 id="endpoint" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Endpoint
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The base endpoint is{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            https://s3.kraterion.com
          </code>
          . Use <em>path-style</em> addressing (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            s3.kraterion.com/bucket/key
          </code>
          ) — virtual-hosted style isn&apos;t supported yet, so point your client at
          the endpoint URL directly.
        </p>

        <h2
          id="authentication"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Authentication
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Requests are signed with AWS Signature Version 4, using an S3 key (the{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            AKIA…
          </code>{" "}
          access key id and its secret) from the dashboard. The service in the
          signing scope must be{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            s3
          </code>
          ; the region is read from the scope but its value is ignored, so any
          region works. Bearer tokens do not work here — see{" "}
          <a
            href="/docs/api-keys"
            className="text-krater underline-offset-2 hover:underline"
          >
            API keys
          </a>
          .
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "client.py",
                code: `import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.kraterion.com",
    aws_access_key_id="AKIA...",
    aws_secret_access_key="...",
    region_name="us-east-1",  # any region; ignored by the gateway
)`,
              },
            ]}
          />
        </div>

        <h2
          id="supported-operations"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Supported operations
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-stone-200/60 text-left">
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Operation
                </th>
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Request
                </th>
                <th className="py-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody>
              {OPS.map(([op, req, notes]) => (
                <tr key={op} className="border-b border-stone-200/60 align-top">
                  <td className="py-2.5 pr-4 text-ink">{op}</td>
                  <td className="py-2.5 pr-4">
                    <code className="font-mono text-[12px] text-stone-600">
                      {req}
                    </code>
                  </td>
                  <td className="py-2.5 leading-[1.6] text-stone-700">{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="unsupported" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Not supported
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          A few operations return{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            501 NotImplemented
          </code>{" "}
          by design:
        </p>
        <ul className="mt-3 flex flex-col gap-2 text-[15px] leading-[1.7] text-stone-700">
          <li>
            <span className="text-ink">CreateBucket</span> — buckets are on-chain
            objects owned by you, so they&apos;re created in the dashboard with your
            signature, not over S3.
          </li>
          <li>
            <span className="text-ink">ListObjects (V1)</span> — use{" "}
            <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
              list_objects_v2
            </code>{" "}
            instead.
          </li>
          <li>
            <span className="text-ink">Object tagging</span> and bucket
            sub-resources (versioning, lifecycle, ACL, CORS, and similar).
          </li>
        </ul>

        <h2
          id="acl-and-visibility"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          ACL &amp; visibility
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          S3 ACL headers (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            x-amz-acl
          </code>
          , storage class, server-side encryption) are accepted but ignored, so
          default client behavior doesn&apos;t error. Visibility is a property of the{" "}
          <em>bucket</em>, not of individual objects or ACLs: a bucket is private
          (Seal-gated) or public, and you flip it in the dashboard. Encryption
          happens either way — visibility only changes who is allowed to decrypt.
        </p>

        <h2 id="size-caps" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Size caps
        </h2>
        <ul className="mt-4 flex flex-col gap-2 text-[15px] leading-[1.7] text-stone-700">
          <li>
            <span className="text-ink">PutObject</span> — up to 2 GiB per object;
            larger uploads return{" "}
            <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
              EntityTooLarge
            </code>
            .
          </li>
          <li>
            <span className="text-ink">GetObject</span> — decryption buffers the
            whole object, so the same 2 GiB ceiling applies on read.
          </li>
          <li>
            <span className="text-ink">User metadata</span> —{" "}
            <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
              x-amz-meta-*
            </code>{" "}
            totals up to 2 KiB.
          </li>
        </ul>

        <h2 id="public-urls" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Public buckets
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Objects in a bucket marked public are readable without signing, at{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            GET https://s3.kraterion.com/public/:bucket/:key
          </code>
          . This is the path to use for assets you want to serve openly.
        </p>

        <h2 id="errors" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Errors
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Errors come back as standard S3 XML with the usual codes (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            NoSuchBucket
          </code>
          ,{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            BucketNotEmpty
          </code>
          ,{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            EntityTooLarge
          </code>
          ). One Kraterion-specific code worth knowing:{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            KeyAccessRevoked
          </code>{" "}
          — returned on read or write when the bucket&apos;s API access has been
          revoked on-chain. See{" "}
          <a
            href="/docs/architecture"
            className="text-krater underline-offset-2 hover:underline"
          >
            how revocation works
          </a>
          .
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
