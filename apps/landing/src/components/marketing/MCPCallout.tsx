import { Box, Sparkles, Terminal, Code2, Workflow } from "lucide-react";
import { FadeUp } from "@/components/motion/FadeUp";
import { NumberedEyebrow } from "./rich/NumberedEyebrow";

/**
 * MCPCallout — a sub-beat below the OpenAI-compatible hero. Tells the story
 * "same agent backend, reachable from your AI assistant via MCP".
 *
 * Layout: header (eyebrow + sub-headline + lede), then a 2-up grid below —
 * the actual claude_desktop_config.json snippet on the left, a compact
 * clients-and-auth panel on the right. Heights matched, hairlines only,
 * single Krater accent on the {url} value in the config.
 */

const CLIENTS: { icon: typeof Box; name: string; note: string }[] = [
  { icon: Sparkles, name: "Claude Desktop", note: "First-party MCP host" },
  { icon: Code2, name: "Cursor", note: "Editor MCP support" },
  { icon: Terminal, name: "Zed", note: "Editor MCP support" },
  { icon: Workflow, name: "Continue", note: "IDE assistant" },
  { icon: Box, name: "Any MCP client", note: "Implements the spec" },
];

export function MCPCallout() {
  return (
    <div>
      <FadeUp>
        <div className="max-w-[760px]">
          <NumberedEyebrow n="03b" label="Native MCP" />
          <h3 className="mt-4 text-[28px] leading-[1.1] tracking-[-0.01em] text-ink md:text-[36px]">
            Also reachable
            <br />
            <span className="text-stone-500">from your AI assistant.</span>
          </h3>
          <p className="mt-5 max-w-[600px] text-[16px] leading-[1.55] text-stone-700">
            Plug Kraterion into Claude Desktop, Cursor, or any MCP-compatible client. Your knowledge, your tools, and persistent memory — over a different protocol, with the same scoped credentials.
          </p>
        </div>
      </FadeUp>

      <div className="mt-10 grid items-stretch gap-4 md:grid-cols-[1.15fr_0.85fr]">
        {/* LEFT — config snippet */}
        <FadeUp className="flex">
          <ConfigSnippet />
        </FadeUp>

        {/* RIGHT — compatible clients + auth */}
        <FadeUp delay={0.1} className="flex">
          <ClientsPanel />
        </FadeUp>
      </div>
    </div>
  );
}

/* ─── Config snippet ─────────────────────────────────────────────── */

function ConfigSnippet() {
  return (
    <div className="hairline flex w-full flex-col overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="font-mono text-[11px] text-stone-600">
          claude_desktop_config.json
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Paste this in
        </span>
      </div>
      <pre className="m-0 flex-1 overflow-x-auto p-5 font-mono text-[13px] leading-[1.6] text-stone-700">
{`{
  `}<span className="text-stone-500">{`"mcpServers"`}</span>{`: {
    `}<span className="text-stone-500">{`"kraterion"`}</span>{`: {
      `}<span className="text-stone-500">{`"url"`}</span>{`: `}<span className="text-krater">{`"https://mcp.kraterion.com"`}</span>{`,
      `}<span className="text-stone-500">{`"auth"`}</span>{`: {
        `}<span className="text-stone-500">{`"type"`}</span>{`: `}<span className="text-[color:var(--color-success)]">{`"oauth"`}</span>{`,
        `}<span className="text-stone-500">{`"dcr"`}</span>{`: `}<span className="text-[color:var(--color-success)]">{`true`}</span>{`
      }
    }
  }
}`}
      </pre>
      <div className="flex items-center justify-between border-t border-stone-200/60 bg-stone-50/60 px-4 py-2.5 font-mono text-[11px]">
        <span className="text-stone-600">
          OAuth 2.1 · Dynamic Client Registration
        </span>
        <span className="inline-flex items-center gap-1.5 text-[color:var(--color-success)]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-success)]" />
          auto-register
        </span>
      </div>
    </div>
  );
}

/* ─── Clients + auth panel ──────────────────────────────────────── */

function ClientsPanel() {
  return (
    <div className="hairline flex w-full flex-col overflow-hidden rounded-lg border border-stone-200/60 bg-cream">
      <div className="flex items-center justify-between border-b border-stone-200/60 bg-stone-50 px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.16em] font-medium text-stone-500">
          Works with
        </span>
        <span className="font-mono text-[11px] text-stone-600">
          mcp.kraterion.com
        </span>
      </div>

      <ul className="flex-1 divide-y divide-stone-200/60">
        {CLIENTS.map((c) => (
          <li
            key={c.name}
            className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]"
          >
            <span className="inline-flex items-center gap-2.5 text-ink">
              <c.icon size={14} strokeWidth={1.5} className="text-stone-500" />
              {c.name}
            </span>
            <span className="font-mono text-[11px] text-stone-500">{c.note}</span>
          </li>
        ))}
      </ul>

      {/* Footer band — what the protocol gives you */}
      <div className="grid grid-cols-3 divide-x divide-stone-200/60 border-t border-stone-200/60 bg-stone-50/60">
        <MicroStat label="Tools" value="7 · same" />
        <MicroStat label="Scope" value="per-agent" accent />
        <MicroStat label="Auth" value="OAuth 2.1" />
      </div>
    </div>
  );
}

function MicroStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-medium text-stone-500">
        {label}
      </span>
      <span
        className={`font-mono text-[13px] ${accent ? "text-krater" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
