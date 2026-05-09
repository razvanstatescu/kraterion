import { z } from "zod";

const SUI_ADDRESS = /^0x[0-9a-f]{1,64}$/;
const PROJECT_NAME = /^[a-z0-9-]+$/;

export const devSignUpSchema = z.object({
  email: z.string().email(),
  sui_address: z.string().regex(SUI_ADDRESS, "Sui address must be 0x-prefixed hex"),
  project_name: z.string().min(1).max(64).regex(PROJECT_NAME).optional(),
  key_name: z.string().min(1).max(64).optional(),
});
export type DevSignUpDto = z.infer<typeof devSignUpSchema>;

export const devSignInSchema = z.object({
  email: z.string().email(),
});
export type DevSignInDto = z.infer<typeof devSignInSchema>;
