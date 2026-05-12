import { z } from "zod";

export const listActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
export type ListActivityQuery = z.infer<typeof listActivityQuerySchema>;
