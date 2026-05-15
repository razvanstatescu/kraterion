import { z } from "zod";

// Free-form label, alphanumerics + dash/space/underscore. Same flavor
// as ApiKey.name so the constraints feel consistent across resources.
const AGENT_NAME = /^[A-Za-z0-9 _.\-]{1,64}$/;
// Cap the system prompt at 8 KiB to keep audit rows reasonable and
// prevent accidental megaprompts blowing the context window.
const SYSTEM_PROMPT_MAX_BYTES = 8 * 1024;

export const createAgentSchema = z.object({
  name: z.string().regex(AGENT_NAME, "Use 1–64 chars: letters, digits, spaces, dots, hyphens, underscores."),
  description: z.string().max(280).optional(),
  system_prompt: z
    .string()
    .min(1, "System prompt is required.")
    .max(SYSTEM_PROMPT_MAX_BYTES, `System prompt exceeds the ${SYSTEM_PROMPT_MAX_BYTES} byte cap.`),
  model: z.string(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(8192).optional(),
  top_k: z.number().int().min(1).max(32).optional(),
  bucket_ids: z.array(z.string().uuid()).default([]),
  // P4 — tool names enabled for this agent. Validated against the
  // server-side registry; an unknown name fails create.
  tools: z.array(z.string().min(1).max(64)).default([]),
});
export type CreateAgentDto = z.infer<typeof createAgentSchema>;

// Update mirrors create but every field is optional. Renaming an agent
// just updates `name`; reattaching buckets replaces the AgentBucket
// list wholesale (simpler than diffing — the dashboard sends the full
// desired set).
export const updateAgentSchema = z.object({
  name: z.string().regex(AGENT_NAME).optional(),
  description: z.string().max(280).nullable().optional(),
  system_prompt: z.string().min(1).max(SYSTEM_PROMPT_MAX_BYTES).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(8192).optional(),
  top_k: z.number().int().min(1).max(32).optional(),
  bucket_ids: z.array(z.string().uuid()).optional(),
  tools: z.array(z.string().min(1).max(64)).optional(),
});
export type UpdateAgentDto = z.infer<typeof updateAgentSchema>;

// Chat payload — strict subset of OpenAI Chat Completions. Additive
// `include_*` flags mirror DigitalOcean's agent API for parity with
// any agent-aware tooling out there.
//
// `role: "system"` is intentionally rejected: the agent's system
// prompt is server-built from `agent.system_prompt` plus the
// retrieval block, and accepting a client-supplied system message
// would let any caller rewrite the agent's identity per request
// (defeating the agent abstraction). OpenAI's wire format allows
// it; we don't.
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

export const chatCompletionsSchema = z.object({
  messages: z.array(chatMessageSchema).min(1),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(8192).optional(),
  stream: z.boolean().optional(),
  // Kraterion extensions — ignored by stock OpenAI clients.
  include_retrieval_info: z.boolean().default(true),
  include_citations: z.boolean().default(true),
});
export type ChatCompletionsDto = z.infer<typeof chatCompletionsSchema>;

// Redacted shape we return on the wire. No sub-wallet seed exposure
// (that lives in SubWallet.mnemonic_wrapped behind the KMS).
export interface AgentJson {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_k: number;
  status: "active" | "revoked";
  sub_wallet_address: string;
  bucket_ids: string[];
  /** Enabled built-in tool names — fed to OpenAI as `tools[]` at chat
   *  time. Empty array means "no tools; pure RAG." */
  tools: string[];
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}

// === P6 — Embed widget share tokens ===

// Accept either bare https URLs or wildcards is over-engineering for v1.
// Plain URL match against `Origin` header. We strip trailing slash to be
// kind to humans copying values from address bars.
const ORIGIN_REGEX = /^https?:\/\/[^\/\s]+$/;

export const createShareTokenSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .describe("Human-readable label, e.g. 'marketing site widget'."),
  allowed_origins: z
    .array(z.string().regex(ORIGIN_REGEX, "Use https://host or http://host (no trailing path)."))
    .min(1, "At least one origin is required.")
    .max(20),
  max_requests_per_day: z.number().int().min(1).max(1_000_000).nullable().default(1000),
  max_spend_usd_per_day: z.number().min(0).max(1_000).nullable().default(5),
  /** When false, the model's system prompt drops the citation
   *  contract and the response omits source/retrieval info. Default
   *  true preserves the dashboard-style chat experience. */
  cite_sources: z.boolean().default(true),
});
export type CreateShareTokenDto = z.infer<typeof createShareTokenSchema>;

/**
 * P6 — Edit an existing share token. Every field is optional; only
 * provided fields are updated. Token material (`token_hash`,
 * `token_prefix`, `network`, `agent_id`) is intentionally immutable —
 * editing one of those would mean issuing a new credential, which the
 * mint endpoint already covers.
 */
export const updateShareTokenSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9 _.\-]{1,64}$/).optional(),
  allowed_origins: z
    .array(z.string().regex(ORIGIN_REGEX))
    .min(1)
    .max(20)
    .optional(),
  max_requests_per_day: z
    .number()
    .int()
    .min(1)
    .max(1_000_000)
    .nullable()
    .optional(),
  max_spend_usd_per_day: z.number().min(0).max(1_000).nullable().optional(),
  cite_sources: z.boolean().optional(),
});
export type UpdateShareTokenDto = z.infer<typeof updateShareTokenSchema>;

export interface ShareTokenJson {
  id: string;
  agent_id: string;
  name: string;
  token_prefix: string;
  network: "testnet" | "mainnet";
  allowed_origins: string[];
  max_requests_per_day: number | null;
  max_spend_usd_per_day: number | null; // dollars, not micros, on the wire
  cite_sources: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}
