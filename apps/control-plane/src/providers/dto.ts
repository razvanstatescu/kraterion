import { z } from "zod";

// Closed set so adding a new provider is a deliberate code change (and
// not an arbitrary string in the URL). Lowercase identifiers — the DB
// column is case-sensitive and the validation ping picks per-provider
// transport.
export const PROVIDERS = ["openai"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type ProviderName = z.infer<typeof providerSchema>;

// OpenAI keys today begin with `sk-` and are at least ~40 chars. We
// don't enforce the prefix (project keys, scoped keys, future formats)
// but a sanity-floor on length catches obvious paste mistakes before
// they hit the OpenAI /models ping.
export const upsertCredentialSchema = z.object({
  api_key: z.string().min(20).max(200),
});
export type UpsertCredentialDto = z.infer<typeof upsertCredentialSchema>;

export interface RedactedCredential {
  provider: ProviderName;
  key_last_4: string;
  status: "active" | "invalid" | "revoked";
  last_validated: Date | null;
  created_at: Date;
  updated_at: Date;
}
