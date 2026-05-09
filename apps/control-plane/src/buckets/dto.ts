import { z } from "zod";

const UUID = z.string().uuid();

export const listBucketsQuerySchema = z.object({
  project_id: UUID.optional(),
  include_deleted: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().min(1).optional(),
});
export type ListBucketsQuery = z.infer<typeof listBucketsQuerySchema>;

export const listObjectsQuerySchema = z.object({
  prefix: z.string().max(1024).optional(),
  include_deleted: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(100),
  cursor: z.string().min(1).optional(),
});
export type ListObjectsQuery = z.infer<typeof listObjectsQuerySchema>;
