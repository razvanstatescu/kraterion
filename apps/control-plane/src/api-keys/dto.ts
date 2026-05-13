import { z } from "zod";

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(64),
});
export type CreateApiKeyDto = z.infer<typeof createApiKeySchema>;

export const createBearerTokenSchema = z.object({
  name: z.string().min(1).max(64),
});
export type CreateBearerTokenDto = z.infer<typeof createBearerTokenSchema>;
