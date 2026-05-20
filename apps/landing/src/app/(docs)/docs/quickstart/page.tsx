import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Quickstart — Kraterion docs",
  description: "Get from zero to a queryable bucket in under five minutes.",
};

const HEADINGS = [
  { id: "install", label: "Install", level: 2 as const },
  { id: "bucket", label: "Create a bucket", level: 2 as const },
  { id: "upload", label: "Upload a file", level: 2 as const },
  { id: "query", label: "Query the bucket", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Getting started</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">Quickstart</h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Get from zero to a queryable bucket in under five minutes.
        </p>

        <h2 id="install" className="mt-16 text-[24px] leading-[1.2] text-ink">Install</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Use any S3 client. We'll use boto3 for this guide.
        </p>
        <div className="mt-4">
          <CodeBlock tabs={[{ lang: "bash", filename: "shell", code: "pip install boto3" }]} />
        </div>

        <h2 id="bucket" className="mt-16 text-[24px] leading-[1.2] text-ink">Create a bucket</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Point the client at our endpoint and call <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">CreateBucket</code>.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "create.py",
                code: `import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.kraterion.com",
    aws_access_key_id="...",
    aws_secret_access_key="...",
)
s3.create_bucket(Bucket="my-bucket")`,
              },
            ]}
          />
        </div>

        <h2 id="upload" className="mt-16 text-[24px] leading-[1.2] text-ink">Upload a file</h2>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "upload.py",
                code: `s3.upload_file("photo.jpg", "my-bucket", "photo.jpg")`,
              },
            ]}
          />
        </div>

        <h2 id="query" className="mt-16 text-[24px] leading-[1.2] text-ink">Query the bucket</h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Enable indexing and ask a question over the bucket's contents.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "shell",
                code: `kraterion index s3://my-bucket --enable-rag
kraterion ask my-bucket "what's in this photo?"`,
              },
            ]}
          />
        </div>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
