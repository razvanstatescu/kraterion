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

/** Render bucket. Drives the section header in the picker. */
export type AgentToolGroup = "storage" | "knowledge" | "memory";

export interface AgentToolMeta {
  /** Wire name; matches the server registry. */
  name: string;
  /** Sentence-case label for the tool-card. */
  label: string;
  /** One-sentence description shown in the picker. */
  description: string;
  /** Read = safe by default. Write = creates an on-chain receipt. */
  kind: AgentToolKind;
  /** Render-time grouping for the picker section headers. */
  group: AgentToolGroup;
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
    group: "knowledge",
    icon: "search",
  },
  {
    name: "kraterion_get_manifest",
    label: "Get manifest",
    description:
      "Fetch the knowledge manifest for an object — chunk count, " +
      "embedding model, on-chain manifest archive.",
    kind: "read",
    group: "knowledge",
    icon: "info",
  },
  {
    name: "kraterion_list_buckets",
    label: "List buckets",
    description: "Enumerate the buckets in the agent's project.",
    kind: "read",
    group: "storage",
    icon: "folder",
  },
  {
    name: "kraterion_list_objects",
    label: "List objects",
    description: "Browse the objects inside a specific bucket.",
    kind: "read",
    group: "storage",
    icon: "folder",
  },
  {
    name: "kraterion_read_object",
    label: "Read object",
    description: "Fetch a single object's content (capped at 1 MiB).",
    kind: "read",
    group: "storage",
    icon: "file",
  },
  {
    name: "kraterion_write_object",
    label: "Write object",
    description:
      "Create or replace a file in a bucket. Mints an on-chain " +
      "SharedBlob; the Move tx digest is captured for the audit trail.",
    kind: "write",
    group: "storage",
    icon: "code",
  },
  {
    name: "memory_remember",
    label: "Remember",
    description:
      "Persist a fact to the agent's long-term memory (MemWal on " +
      "Walrus). Use for preferences and stable context that future " +
      "sessions should be able to recall.",
    kind: "write",
    group: "memory",
    icon: "brain",
  },
  {
    name: "memory_recall",
    label: "Recall",
    description:
      "Search the agent's long-term memory for facts relevant to a " +
      "query. Useful at the start of a task to surface preferences and " +
      "prior context.",
    kind: "read",
    group: "memory",
    icon: "brain",
  },
];

/** Display order + header text per group. Renderers iterate this so
 *  groups appear in a predictable order regardless of CATALOG order. */
export const AGENT_TOOL_GROUPS: readonly {
  key: AgentToolGroup;
  label: string;
}[] = [
  { key: "storage", label: "Storage" },
  { key: "knowledge", label: "Knowledge" },
  { key: "memory", label: "Persistent memory" },
];

export function findToolMeta(name: string): AgentToolMeta | undefined {
  return AGENT_TOOL_CATALOG.find((t) => t.name === name);
}
