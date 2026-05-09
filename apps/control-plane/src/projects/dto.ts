import { z } from "zod";

export const createProjectSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Project name may contain only a-z, 0-9, and hyphens"),
});
export type CreateProjectDto = z.infer<typeof createProjectSchema>;
