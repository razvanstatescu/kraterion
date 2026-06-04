import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Chat API — Kraterion docs",
  description:
    "Talk to an agent over an OpenAI-compatible Chat Completions endpoint. Standard request and response, plus a kraterion extension carrying retrieval and citations.",
};

const HEADINGS = [
  { id: "endpoint", label: "Endpoint", level: 2 as const },
  { id: "request", label: "Request", level: 2 as const },
  { id: "response", label: "Response", level: 2 as const },
  { id: "streaming", label: "Streaming", level: 2 as const },
  { id: "citations-extension", label: "Citations extension", level: 2 as const },
  { id: "openai-sdk", label: "Using the OpenAI SDK", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Agents</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Chat API
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Agents speak the OpenAI Chat Completions protocol. Anything that already
          talks to OpenAI can talk to a Kraterion agent — and gets retrieval and
          citations back as an extra field.
        </p>

        <h2 id="endpoint" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Endpoint
        </h2>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "endpoint",
                code: `POST https://api.kraterion.com/v1/agents/<agent_id>/chat/completions
Authorization: Bearer kr_live_...`,
              },
            ]}
          />
        </div>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Authenticate with a bearer token or a share token. The agent&apos;s
          model, tools, and knowledge come from its saved configuration.
        </p>

        <h2 id="request" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Request
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          A standard Chat Completions body. The system prompt belongs to the agent,
          so a{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            system
          </code>{" "}
          message in the request is rejected, and the last message must be from the{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            user
          </code>
          . Two Kraterion-specific flags control the extension payload.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "json",
                filename: "request.json",
                code: `{
  "messages": [
    { "role": "user", "content": "What's our refund window?" }
  ],
  "model": "gpt-4o-mini",
  "temperature": 0.2,
  "max_tokens": 512,
  "stream": false,
  "include_retrieval_info": true,
  "include_citations": true
}`,
              },
            ]}
          />
        </div>

        <h2 id="response" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Response
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          The familiar Chat Completions object, plus a{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion
          </code>{" "}
          block with retrieval stats, citations, and any tool calls.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "json",
                filename: "response.json",
                code: `{
  "id": "chatcmpl_kr_...",
  "object": "chat.completion",
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Refunds are accepted within 30 days..." },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 812, "completion_tokens": 48, "total_tokens": 860 },
  "kraterion": {
    "agent_id": "...",
    "retrieval": {
      "bucket_ids": ["..."],
      "hit_count": 3,
      "retrieval_latency_ms": 41,
      "llm_latency_ms": 520,
      "total_latency_ms": 564
    },
    "citations": [
      {
        "index": 0,
        "chunk_hash": "sha256-...",
        "s3_key": "handbook.md",
        "ordinal": 7,
        "bucket_id": "...",
        "source_walrus_blob_id": "...",
        "cited": true
      }
    ]
  }
}`,
              },
            ]}
          />
        </div>

        <h2 id="streaming" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Streaming
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Set{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            stream: true
          </code>{" "}
          for Server-Sent Events. You get standard{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            chat.completion.chunk
          </code>{" "}
          frames for the text, interleaved{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion.tool_call
          </code>{" "}
          frames as tools run, a final{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kraterion.extension
          </code>{" "}
          frame with the retrieval and citation summary, and then{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            data: [DONE]
          </code>
          .
        </p>

        <h2
          id="citations-extension"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Citations extension
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Each citation points at the exact chunk the answer drew on — its{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            content_hash
          </code>
          , the source object and ordinal, and the Walrus blob it came from. Because
          the hash is content-addressed, a reader can verify a quote was really in
          your data and hasn&apos;t been altered. The{" "}
          <a
            href="/docs/knowledge/search"
            className="text-krater underline-offset-2 hover:underline"
          >
            Search &amp; citations
          </a>{" "}
          page covers what each field means.
        </p>

        <h2 id="openai-sdk" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Using the OpenAI SDK
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Point the base URL at the agent and pass your bearer token as the API key.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "python",
                filename: "client.py",
                code: `from openai import OpenAI

client = OpenAI(
    base_url="https://api.kraterion.com/v1/agents/<agent_id>",
    api_key="kr_live_...",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What's our refund window?"}],
)
print(resp.choices[0].message.content)`,
              },
              {
                lang: "typescript",
                filename: "client.ts",
                code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.kraterion.com/v1/agents/<agent_id>",
  apiKey: "kr_live_...",
});

const resp = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "What's our refund window?" }],
});
console.log(resp.choices[0].message.content);`,
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
