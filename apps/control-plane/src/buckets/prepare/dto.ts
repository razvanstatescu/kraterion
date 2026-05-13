import { z } from "zod";

const SUI_ADDRESS = /^0x[0-9a-f]{1,64}$/;
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,62}[a-z0-9]$/;

export const ENCRYPTION_MODE_PRIVATE = 0;
export const ENCRYPTION_MODE_PUBLIC = 1;

export const encryptionModeSchema = z.enum(["private", "public-read"]);
export type EncryptionMode = z.infer<typeof encryptionModeSchema>;

export function encodeMode(m: EncryptionMode): number {
  return m === "private" ? ENCRYPTION_MODE_PRIVATE : ENCRYPTION_MODE_PUBLIC;
}

export const prepareCreateSchema = z.object({
  project_id: z.string().uuid(),
  name: z
    .string()
    .min(3)
    .max(63)
    .regex(BUCKET_NAME, "Bucket name must match S3-style rules (a-z, 0-9, '-', '.')"),
  encryption_mode: encryptionModeSchema.default("private"),
  /** If true (default), bake `grant_api_access(api_addr)` into the same PTB. */
  grant_api_access: z.boolean().default(true),
  /** Override the gateway address baked into the grant. Defaults to the
   *  control-plane's known gateway sub-wallet. Useful for tests. */
  api_addr_override: z.string().regex(SUI_ADDRESS).optional(),
});
export type PrepareCreateDto = z.infer<typeof prepareCreateSchema>;

export const prepareGrantApiSchema = z.object({
  api_addr_override: z.string().regex(SUI_ADDRESS).optional(),
});
export type PrepareGrantApiDto = z.infer<typeof prepareGrantApiSchema>;

/**
 * Agent grant/revoke takes the agent id; the CP resolves its
 * sub-wallet address server-side so the dashboard can't accidentally
 * (or maliciously) name a foreign principal.
 */
export const prepareAgentSchema = z.object({
  agent_id: z.string().uuid(),
});
export type PrepareAgentDto = z.infer<typeof prepareAgentSchema>;

export const prepareVisibilitySchema = z.object({
  encryption_mode: encryptionModeSchema,
});
export type PrepareVisibilityDto = z.infer<typeof prepareVisibilitySchema>;
