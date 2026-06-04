import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Quickstart — Kraterion docs",
  description:
    "From a new bucket to a cited agent answer. Sign in, upload with any S3 client, turn on knowledge, and call an agent over an OpenAI-compatible API.",
};

const HEADINGS = [
  { id: "sign-in", label: "Sign in", level: 2 as const },
  { id: "create-bucket", label: "Create a bucket", level: 2 as const },
  { id: "generate-key", label: "Generate an API key", level: 2 as const },
  { id: "upload", label: "Upload a file", level: 2 as const },
  { id: "enable-knowledge", label: "Enable knowledge", level: 2 as const },
  { id: "create-agent", label: "Create an agent", level: 2 as const },
  { id: "invoke", label: "Invoke the agent", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Getting started</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Quickstart
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Go from an empty bucket to an agent that answers questions over your
          files — with citations back to the bytes on Walrus.
        </p>

        <h2 id="sign-in" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Sign in
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Open{" "}
          <a
            href="https://app.kraterion.com"
            className="text-krater underline-offset-2 hover:underline"
          >
            app.kraterion.com
          </a>{" "}
          and sign in with Google. Behind the scenes this is zkLogin — you get a
          Sui account derived from your login, with no seed phrase to manage. Your
          buckets and files will be owned by that account.
        </p>

        <h2
          id="create-bucket"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Create a bucket
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Create your first bucket from the dashboard. Buckets are created in the
          app rather than over the S3 API on purpose: a bucket is an on-chain
          object whose owner is set to <em>you</em>, so creating one needs your
          signature. Calling{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            CreateBucket
          </code>{" "}
          over S3 returns{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            501 NotImplemented
          </code>
          .
        </p>

        <h2
          id="generate-key"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Generate an API key
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          In the dashboard, create an S3 key. You&apos;ll get an access key id
          (starting with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            AKIA
          </code>
          ) and a secret. The secret is shown once — copy it now. Kraterion uses
          two kinds of credentials: S3 keys for the storage API, and bearer tokens
          for everything else. See{" "}
          <a
            href="/docs/api-keys"
            className="text-krater underline-offset-2 hover:underline"
          >
            API keys
          </a>
          .
        </p>

        <h2 id="upload" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Upload a file
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Point any S3 client at{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            s3.kraterion.com
          </code>
          . We&apos;ll use boto3. The region can be anything — the gateway reads
          the service but ignores the region.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "upload.py",
                code: `import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://s3.kraterion.com",
    aws_access_key_id="AKIA...",
    aws_secret_access_key="...",
    region_name="us-east-1",
)

# Upload a file
s3.upload_file("handbook.md", "my-bucket", "handbook.md")

# List what's in the bucket (use V2 — V1 is not supported)
for obj in s3.list_objects_v2(Bucket="my-bucket").get("Contents", []):
    print(obj["Key"], obj["Size"])`,
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The file is encrypted at the gateway before it&apos;s stored, so the
          bytes on Walrus are ciphertext. Reads are decrypted transparently while
          your key is authorized.
        </p>

        <h2
          id="enable-knowledge"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Enable knowledge
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Turn on knowledge for the bucket to make it searchable. Kraterion chunks
          and embeds every object so agents can retrieve passages with citations.
          Enabling needs an OpenAI key configured on the project (Kraterion uses
          your key to embed). Toggle it in the dashboard, or over the API with a
          bearer token:
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "shell",
                code: `curl -X POST https://api.kraterion.com/v1/buckets/<bucket_id>/knowledge \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"enabled": true}'`,
              },
            ]}
          />
        </div>

        <h2
          id="create-agent"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Create an agent
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Create an agent and attach the bucket. An agent is a saved
          configuration — a system prompt, a model, the buckets it can see, and
          the tools it can call. Use the dashboard, or the API:
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "shell",
                code: `curl -X POST https://api.kraterion.com/v1/projects/<project_id>/agents \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "handbook-bot",
    "system_prompt": "Answer questions using the company handbook.",
    "model": "gpt-4o-mini",
    "bucket_ids": ["<bucket_id>"],
    "tools": ["kraterion_search"]
  }'`,
              },
            ]}
          />
        </div>

        <h2 id="invoke" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Invoke the agent
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The agent speaks the OpenAI Chat Completions protocol, so the official
          OpenAI SDK works unchanged — just point its base URL at the agent and
          use your bearer token as the API key.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "ask.py",
                code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.kraterion.com/v1/agents/<agent_id>",
    api_key="kr_live_...",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What's our refund window?"}],
)

print(resp.choices[0].message.content)
# Citations and retrieval info arrive in the response's "kraterion" field.`,
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          That&apos;s the whole loop. From here, give the agent more{" "}
          <a
            href="/docs/agents/tools"
            className="text-krater underline-offset-2 hover:underline"
          >
            tools
          </a>
          , wire up{" "}
          <a
            href="/docs/agents/memory"
            className="text-krater underline-offset-2 hover:underline"
          >
            memory
          </a>
          , or{" "}
          <a
            href="/docs/agents/embed"
            className="text-krater underline-offset-2 hover:underline"
          >
            embed it
          </a>{" "}
          on your site.
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
