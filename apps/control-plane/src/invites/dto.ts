import { z } from "zod";

/** Public: validate a code before sign-up. */
export const validateInviteSchema = z.object({
  code: z.string().trim().min(1).max(32),
});
export type ValidateInviteDto = z.infer<typeof validateInviteSchema>;

/** Admin: mint a batch of codes. */
export const generateInvitesSchema = z.object({
  /** How many distinct codes to mint (1..500). */
  count: z.number().int().min(1).max(500).default(1),
  /** Redemptions allowed per code (1 = single-use). */
  max_claims: z.number().int().min(1).max(100_000).default(1),
  /** Optional bookkeeping label (who/why). */
  note: z.string().trim().max(200).optional(),
  /** Optional ISO expiry; omit for never-expires. */
  expires_at: z.string().datetime().optional(),
});
export type GenerateInvitesDto = z.infer<typeof generateInvitesSchema>;

/** Admin: enable/disable a code. */
export const disableInviteSchema = z.object({
  disabled: z.boolean().default(true),
});
export type DisableInviteDto = z.infer<typeof disableInviteSchema>;
