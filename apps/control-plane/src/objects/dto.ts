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
