import { z } from "zod";

export const zkLoginSchema = z.object({
  /** The Google ID token from the OAuth redirect flow. */
  google_jwt: z.string().min(20),
  /** Invite code, required only on first sign-up when the gate is enabled.
   *  Ignored for returning users. Loosely bounded here; the invites service
   *  normalizes + validates the exact `KRT-XXXXXX` shape. */
  invite_code: z.string().trim().min(1).max(32).optional(),
});
export type ZkLoginDto = z.infer<typeof zkLoginSchema>;

const SUI_DIGEST = /^[A-Za-z0-9+/=_-]+$/;

export const executeSponsoredSchema = z.object({
  /** Digest returned by `POST /v1/buckets/prepare-*`. */
  digest: z.string().min(8).regex(SUI_DIGEST),
  /** zkLogin signature produced by the dashboard wallet. */
  signature: z.string().min(20),
});
export type ExecuteSponsoredDto = z.infer<typeof executeSponsoredSchema>;
