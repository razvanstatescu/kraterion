import type { Metadata } from "next";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { OnThisPage } from "@/components/marketing/OnThisPage";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Embed & share — Kraterion docs",
  description:
    "Put an agent on your own website with a share token: origin-locked, rate-limited, and spend-capped, dropped in with a single script tag.",
};

const HEADINGS = [
  { id: "share-tokens", label: "Share tokens", level: 2 as const },
  { id: "origin-allowlist", label: "Origin allowlist", level: 2 as const },
  { id: "caps", label: "Daily caps", level: 2 as const },
  { id: "script-tag", label: "Script tag", level: 2 as const },
  { id: "cite-sources", label: "Citing sources", level: 2 as const },
];

export default function Page() {
  return (
    <div className="grid grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_180px]">
      <article className="max-w-[720px]">
        <p className="micro text-stone-500">Agents</p>
        <h1 className="mt-4 text-[40px] leading-[1.1] tracking-[-0.01em]">
          Embed &amp; share
        </h1>
        <p className="mt-6 text-[18px] leading-[1.65] text-stone-700">
          Expose an agent to the public without exposing your account credentials.
          A share token is a separate, narrowly-scoped key you can put in
          client-side code.
        </p>

        <h2
          id="share-tokens"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Share tokens
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Mint a share token for an agent. The token (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            kr_share_…
          </code>
          ) is shown once. It only works for this one agent, only from the origins
          you allow, and only within its daily caps.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "bash",
                filename: "share.sh",
                code: `curl -X POST https://api.kraterion.com/v1/agents/<agent_id>/share-tokens \\
  -H "Authorization: Bearer kr_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "marketing-site",
    "allowed_origins": ["https://example.com"],
    "max_requests_per_day": 1000,
    "max_spend_usd_per_day": 5,
    "cite_sources": true
  }'`,
              },
            ]}
          />
        </div>

        <h2
          id="origin-allowlist"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Origin allowlist
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Every request is checked against{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            allowed_origins
          </code>{" "}
          using the browser&apos;s{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            Origin
          </code>{" "}
          header. List the exact origins (
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            https://host
          </code>
          ) where the widget is allowed to run; calls from anywhere else are
          refused. This is what keeps a leaked embed token from being usable on a
          different site.
        </p>

        <h2 id="caps" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Daily caps
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Two limits bound exposure:{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            max_requests_per_day
          </code>{" "}
          (default 1000) and{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            max_spend_usd_per_day
          </code>{" "}
          (default 5). When either is reached, the agent stops answering through
          that token until the next day. Adjust a token with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            PATCH /v1/share-tokens/:id
          </code>{" "}
          or kill it with{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            POST /v1/share-tokens/:id/revoke
          </code>
          .
        </p>

        <h2 id="script-tag" className="mt-16 text-[24px] leading-[1.2] text-ink">
          Script tag
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          Drop the token into a single script tag on your page to render the chat
          widget.
        </p>
        <div className="mt-4">
          <CodeBlock
            tabs={[
              {
                lang: "html",
                filename: "index.html",
                code: `<script
  src="https://app.kraterion.com/embed.js"
  data-token="kr_share_..."
  async
></script>`,
              },
            ]}
          />
        </div>

        <h2
          id="cite-sources"
          className="mt-16 text-[24px] leading-[1.2] text-ink"
        >
          Citing sources
        </h2>
        <p className="mt-3 text-[15px] leading-[1.7] text-stone-700">
          With{" "}
          <code className="rounded-sm bg-stone-100 px-1.5 py-0.5 font-mono text-[13px]">
            cite_sources
          </code>{" "}
          on (the default), embedded answers show where they came from, using the
          same citation data described in the{" "}
          <a
            href="/docs/agents/chat-api"
            className="text-krater underline-offset-2 hover:underline"
          >
            Chat API
          </a>
          . Turn it off for a plain conversational widget.
        </p>
      </article>
      <div className="hidden md:block">
        <OnThisPage headings={HEADINGS} />
      </div>
    </div>
  );
}
