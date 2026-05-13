/**
 * Dashboard-side catalog of built-in agent tools. Mirrors the server
 * registry at
 * `apps/control-plane/src/agents/tools/registry.ts` — when a tool is
 * added there, add the matching row here so the create-agent dialog
 * displays it. The server is the source of truth: tool names not in
 * this catalog still work (the agent can be created with them via
 * the API), but the UI won't render them.
 */

import type { IconName } from "@/components/ui/Icon";

export type AgentToolKind = "read" | "write";

export interface AgentToolMeta {
  /** Wire name; matches the server registry. */
  name: string;
  /** Sentence-case label for the tool-card. */
  label: string;
  /** One-sentence description shown in the picker. */
  description: string;
  /** Read = safe by default. Write = creates an on-chain receipt. */
  kind: AgentToolKind;
  /** Lucide icon name. */
  icon: IconName;
}

export const AGENT_TOOL_CATALOG: readonly AgentToolMeta[] = [
  {
    name: "kraterion_search",
    label: "Search knowledge",
    description:
      "Hybrid retrieval over attached knowledge buckets. Returns " +
      "ranked chunks with verifiable citations.",
    kind: "read",
    icon: "search",
  },
  {
    name: "kraterion_list_buckets",
    label: "List buckets",
    description: "Enumerate the buckets in the agent's project.",
    kind: "read",
    icon: "folder",
  },
  {
    name: "kraterion_list_objects",
    label: "List objects",
    description: "Browse the objects inside a specific bucket.",
    kind: "read",
    icon: "folder",
  },
  {
    name: "kraterion_read_object",
    label: "Read object",
    description: "Fetch a single object's content (capped at 1 MiB).",
    kind: "read",
    icon: "file",
  },
  {
    name: "kraterion_write_object",
    label: "Write object",
    description:
      "Create or replace a file in a bucket. Mints an on-chain " +
      "SharedBlob; the Move tx digest is captured for the audit trail.",
    kind: "write",
    icon: "code",
  },
  {
    name: "kraterion_get_manifest",
    label: "Get manifest",
    description:
      "Fetch the knowledge manifest for an object — chunk count, " +
      "embedding model, on-chain manifest archive.",
    kind: "read",
    icon: "info",
  },
];

export function findToolMeta(name: string): AgentToolMeta | undefined {
  return AGENT_TOOL_CATALOG.find((t) => t.name === name);
}
