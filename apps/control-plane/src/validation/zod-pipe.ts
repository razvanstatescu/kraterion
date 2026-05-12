import type { PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * Build a Nest pipe from a Zod schema. Use as a method-arg pipe so each
 * controller declares the exact schema it accepts:
 *
 *   @Post()
 *   create(@Body(parseBody(createProjectSchema)) dto: CreateProjectDto) {}
 *
 * Validation failures throw `ControlPlaneError("InvalidArgument", ...)`,
 * which the global filter renders as the JSON envelope.
 */
/**
 * Alias of `parseBody` — same pipe applies cleanly to `@Query()` since
 * Nest passes both arg types through the same `transform(value)` call.
 * The two names are retained so the call site reads correctly.
 */
export const parseQuery = <T>(schema: ZodSchema<T>) => parseBody(schema);

/**
 * Alias of `parseBody` for `@Param()` arguments. Identical implementation;
 * the separate name documents intent at the call site.
 */
export const parseParam = <T>(schema: ZodSchema<T>) => parseBody(schema);

export function parseBody<T>(schema: ZodSchema<T>): PipeTransform<unknown, T> {
  return {
    transform(value: unknown): T {
      const result = schema.safeParse(value);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path.join(".") || "(root)";
        const message = issue?.message ?? "Invalid input";
        throw new ControlPlaneError("InvalidArgument", message, { path });
      }
      return result.data;
    },
  };
}
