import { z } from "zod";

const UUID = z.string().uuid();
const S3_KEY = /^[^\x00]{1,1024}$/;

export const prepareUploadSchema = z.object({
  bucket_id: UUID,
  key: z.string().regex(S3_KEY).min(1).max(1024),
  content_type: z
    .string()
    .max(255)
    .regex(/^[\w.+/-]+(?:;\s*[\w.=+/-]+)*$/, "Invalid content-type")
    .optional(),
});
export type PrepareUploadDto = z.infer<typeof prepareUploadSchema>;

/**
 * Body accepted by `POST /v1/objects/:objectId/prepare-download`.
 *
 * `share=false` (the default) returns a CP-signed header envelope: the
 * dashboard fetches the gateway URL with the returned headers attached.
 *
 * `share=true` returns a stand-alone shareable URL (query-string
 * SigV4). Anyone with the URL can GET the object until it expires.
 * Useful for `<img src>`, `curl`, social embeds.
 */
export const prepareDownloadSchema = z.object({
  share: z.boolean().optional().default(false),
});
export type PrepareDownloadDto = z.infer<typeof prepareDownloadSchema>;
