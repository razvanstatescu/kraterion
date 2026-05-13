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
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
}
