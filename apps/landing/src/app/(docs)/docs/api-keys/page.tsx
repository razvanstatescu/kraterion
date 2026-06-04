import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "API keys — Kraterion docs",
  description:
    "Kraterion has two credential types: S3 keys for the storage API and bearer tokens for REST, agents, and MCP. How to generate, scope, and revoke them.",
};

const HEADINGS = [
  { id: "two-credential-types", label: "Two credential types", level: 2 as const },
  { id: "s3-keys", label: "S3 keys", level: 2 as const },
  { id: "bearer-tokens", label: "Bearer tokens", level: 2 as const },
  { id: "generating", label: "Generating", level: 2 as const },
  { id: "revoking", label: "Revoking", level: 2 as const },
  { id: "scope", label: "Which key goes where", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Storage</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          API keys
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Kraterion uses two kinds of credentials. Picking the right one depends on
          which surface you&apos;re calling.
        </p>

        <h2
          id="two-credential-types"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Two credential types
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          <span className="text-ink">S3 keys</span> are AWS-style access key /
          secret pairs used to sign requests to the storage API.{" "}
          <span className="text-ink">Bearer tokens</span> are{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kr_live_…
          </code>{" "}
          /{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kr_test_…
          </code>{" "}
          strings used for the REST control API, agent chat, and MCP. They are not
          interchangeable.
        </p>

        <h2 id="s3-keys" className="mt-16 text-[24px] leading-[1.2] text-ink">
          S3 keys
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          An S3 key is an access key id starting with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            AKIA
          </code>{" "}
          (20 characters) plus a 40-character secret. You use it to sign requests
          to{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            s3.kraterion.com
          </code>{" "}
          with SigV4, exactly like an AWS key. See the{" "}
          <a
            href="/docs/s3-api"
            className="text-krater underline-offset-2 hover:underline"
          >
            S3 API
          </a>
          .
        </p>

        <h2
          id="bearer-tokens"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Bearer tokens
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          A bearer token goes in an{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            Authorization: Bearer …
          </code>{" "}
          header. Use it for control-plane endpoints (buckets, knowledge, agents),
          the agent chat API, and MCP. The{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kr_live_
          </code>{" "}
          and{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kr_test_
          </code>{" "}
          prefixes tell you which network the token is bound to.
        </p>

        <h2 id="generating" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Generating
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Create either type from the dashboard, or over the API. The secret (or
          token) is returned <em>once</em> at creation time and never again — store
          it somewhere safe.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "s3-key.sh",
                code: `curl -X POST https://api.kraterion.com/v1/projects/<project_id>/api-keys \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "uploader" }'
# → { "api_key": { "access_key_id": "AKIA..." }, "secret": "..." }`,
              },
              {
                lang: "bash",
                filename: "bearer.sh",
                code: `curl -X POST https://api.kraterion.com/v1/projects/<project_id>/api-keys/bearer \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "name": "backend" }'
# → { "token": "kr_live_...", "network": "testnet" }`,
              },
            ]}
          />
        </div>

        <h2 id="revoking" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Revoking
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Revoke any key with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            POST /v1/api-keys/:id/revoke
          </code>
          . A revoked key stops working immediately for new requests.
        </p>

        <h2 id="scope" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Which key goes where
        </h2>
        <ul className="mt-4 flex flex-col gap-2 text-[15px] leading-[1.7] text-stone-700">
          <li>
            <span className="text-ink">S3 API</span> (
            <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
              s3.kraterion.com
            </code>
            ) → S3 key, SigV4.
          </li>
          <li>
            <span className="text-ink">REST, agent chat</span> (
            <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
              api.kraterion.com
            </code>
            ) → bearer token.
          </li>
          <li>
            <span className="text-ink">MCP</span> (
            <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
              mcp.kraterion.com
            </code>
            ) → bearer token (or OAuth). S3 keys do not work on MCP.
          </li>
        </ul>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
