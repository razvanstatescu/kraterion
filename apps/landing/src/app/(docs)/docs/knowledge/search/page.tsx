import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Search & citations — Kraterion docs",
  description:
    "Hybrid keyword + vector search over a knowledge bucket, fused with reciprocal rank fusion. Every hit carries a content hash you can verify.",
};

const HEADINGS = [
  { id: "hybrid-retrieval", label: "Hybrid retrieval", level: 2 as const },
  { id: "search-endpoint", label: "Search endpoint", level: 2 as const },
  { id: "chunk-hits", label: "Chunk hits", level: 2 as const },
  { id: "citations", label: "Verifiable citations", level: 2 as const },
  { id: "no-ask-note", label: "Asking questions", level: 2 as const },
];

const HIT_FIELDS = [
  ["s3_key", "The object the chunk came from."],
  ["ordinal", "The chunk's position within that object."],
  ["content", "The chunk text."],
  ["content_hash", "SHA-256 of the chunk — the verification anchor."],
  ["source_walrus_blob_id", "The Walrus blob the content was read from."],
  ["vector_distance", "Semantic distance for the vector leg (lower is closer)."],
  ["bm25_score", "Keyword relevance for the BM25 leg (higher is better)."],
  ["rrf_score", "The fused rank used to order results."],
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Knowledge</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Search &amp; citations
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Search a knowledge bucket and get back ranked passages — each one tied to
          a specific object, position, and set of bytes you can verify.
        </p>

        <h2
          id="hybrid-retrieval"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Hybrid retrieval
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Search runs two legs in parallel: BM25 keyword matching (great for exact
          terms, names, and codes) and vector similarity (great for paraphrases and
          concepts). The two ranked lists are combined with reciprocal rank fusion,
          so a chunk that scores well on either leg surfaces — you don&apos;t have to
          choose between keyword and semantic search.
        </p>

        <h2
          id="search-endpoint"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Search endpoint
        </h2>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "search.sh",
                code: `curl -X POST https://api.kraterion.com/v1/buckets/<bucket_id>/knowledge/search \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "what is the refund window?", "top_k": 8 }'`,
              },
              {
                lang: "json",
                filename: "response.json",
                code: `{
  "hits": [
    {
      "s3_key": "handbook.md",
      "ordinal": 7,
      "content": "Refunds are accepted within 30 days of purchase...",
      "content_hash": "sha256-...",
      "source_walrus_blob_id": "...",
      "vector_distance": 0.18,
      "bm25_score": 9.4,
      "rrf_score": 0.031
    }
  ],
  "embedding_model": "text-embedding-3-small",
  "embedding_dimensions": 1536,
  "query_tokens": 7,
  "latency_ms": 41
}`,
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            query
          </code>{" "}
          is required (up to 4096 characters);{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            top_k
          </code>{" "}
          is optional (1–32).
        </p>

        <h2 id="chunk-hits" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Chunk hits
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Each hit describes one chunk and where it came from.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-stone-200/60 text-left">
                <th className="py-2 pr-4 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Field
                </th>
                <th className="py-2 text-[11px] uppercase tracking-[0.16em] text-stone-500">
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody>
              {HIT_FIELDS.map(([field, meaning]) => (
                <tr key={field} className="border-b border-stone-200/60 align-top">
                  <td className="py-2.5 pr-4">
                    <code className="font-mono text-[12px] text-ink">{field}</code>
                  </td>
                  <td className="py-2.5 leading-[1.6] text-stone-700">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="citations" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Verifiable citations
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            content_hash
          </code>{" "}
          is what makes a citation trustworthy. Because it&apos;s the hash of the
          chunk text and the source blob is content-addressed, anyone can confirm a
          quoted passage genuinely came from your data and wasn&apos;t fabricated or
          edited after the fact. Agent answers carry these same citations in their{" "}
          <a
            href="/docs/agents/chat-api"
            className="text-krater underline-offset-2 hover:underline"
          >
            response extension
          </a>
          .
        </p>

        <h2 id="no-ask-note" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Asking questions
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Search returns passages, not answers. To ask a question in natural
          language and get a written, cited answer, point an{" "}
          <a
            href="/docs/agents"
            className="text-krater underline-offset-2 hover:underline"
          >
            agent
          </a>{" "}
          at the bucket and call its chat endpoint — the agent uses this same
          retrieval under the hood. (There is no standalone{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            /ask
          </code>{" "}
          endpoint; that role belongs to agents.)
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
