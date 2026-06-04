import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Knowledge — Kraterion docs",
  description:
    "Turn a bucket into a searchable index. Kraterion chunks, embeds, and indexes your objects so agents can retrieve passages with verifiable citations.",
};

const HEADINGS = [
  { id: "enable", label: "Enable knowledge", level: 2 as const },
  { id: "prerequisites", label: "Prerequisites", level: 2 as const },
  { id: "indexing-pipeline", label: "The indexing pipeline", level: 2 as const },
  { id: "manifests", label: "Manifests", level: 2 as const },
  { id: "disable-reindex", label: "Backfill & reindex", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Knowledge</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Knowledge
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Knowledge makes a bucket searchable. Once it&apos;s on, every object is
          chunked, embedded, and indexed so an agent — or a direct search call —
          can pull the right passages and cite them.
        </p>

        <h2 id="enable" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Enable knowledge
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Toggle knowledge per bucket in the dashboard, or over the API with a
          bearer token. Enabling kicks off a backfill that indexes whatever is
          already in the bucket.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "enable.sh",
                code: `curl -X POST https://api.kraterion.com/v1/buckets/<bucket_id>/knowledge \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "enabled": true,
    "embedding_model": "text-embedding-3-small",
    "chunk_tokens": 512,
    "chunk_overlap_tokens": 128
  }'`,
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Fetch the current state — including a summary of how many objects are
          indexed, pending, failed, or skipped — with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            GET /v1/buckets/:id/knowledge
          </code>
          .
        </p>

        <h2
          id="prerequisites"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Prerequisites
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Embeddings are generated with your own OpenAI key, so the project needs an
          active OpenAI key configured before knowledge can be enabled. For a
          private bucket, the indexer also needs on-chain access to read the objects
          it&apos;s indexing — enabling knowledge surfaces whether that grant is
          required, and the dashboard walks you through it.
        </p>

        <h2
          id="indexing-pipeline"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          The indexing pipeline
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          When an object lands, the indexer decrypts it, splits it into overlapping
          chunks of{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            chunk_tokens
          </code>{" "}
          tokens (with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            chunk_overlap_tokens
          </code>{" "}
          of overlap to preserve context across boundaries), embeds each chunk, and
          stores both the text and the vector. Overwriting an object re-indexes it;
          deleting it removes its chunks.
        </p>

        <h2 id="manifests" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Manifests
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Indexing produces a manifest per object: the ordered list of chunks, each
          chunk&apos;s content hash, and the Walrus blob ids the content came from.
          The manifest is what makes a citation checkable — a hash ties a quoted
          passage back to specific, content-addressed bytes. Agents can fetch it via
          the{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion_get_manifest
          </code>{" "}
          tool.
        </p>

        <h2
          id="disable-reindex"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Backfill &amp; reindex
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Re-run indexing over the whole bucket with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            POST /v1/buckets/:id/knowledge/backfill
          </code>
          . To change chunking or the embedding model, use{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            POST /v1/buckets/:id/knowledge/reindex
          </code>{" "}
          — it clears the existing chunks and rebuilds them with the new settings.
          Disable knowledge by posting{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            {`{ "enabled": false }`}
          </code>
          .
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
