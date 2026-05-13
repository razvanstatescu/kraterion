import { ControlPlaneError } from "../../errors/control-plane-error.js";
import type { ToolContext } from "./types.js";

/**
 * Resolve `(accountId, bucketName)` to a non-deleted `Bucket` row.
 * Shared by every bucket-scoped tool — same pattern the MCP service
 * uses, lifted here so agent tools don't take a dependency on
 * `McpToolsService`.
 */
export async function findBucketByName(ctx: ToolContext, name: string) {
  const bucket = await ctx.prisma.bucket.findFirst({
    where: {
      name,
      deleted_at: null,
      project: { account_id: ctx.accountId },
    },
  });
  if (!bucket) {
    throw new ControlPlaneError("NotFound", `Bucket "${name}" not found`);
  }
  // Bearer tokens are project-scoped — refuse cross-project use even
  // when the same account owns both projects.
  if (bucket.project_id !== ctx.projectId) {
    throw new ControlPlaneError("NotFound", `Bucket "${name}" not found`);
  }
  return bucket;
}
