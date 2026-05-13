import { z } from "zod";
import { serializeBucket } from "../../buckets/serialize.js";
import { jsonText, type ToolDef } from "./types.js";

export const listBucketsTool: ToolDef<z.ZodObject<Record<string, never>>> = {
  name: "kraterion_list_buckets",
  label: "List buckets",
  description:
    "List the buckets in the agent's project. Returns each bucket's " +
    "name, encryption mode, on-chain object id, and whether knowledge " +
    "indexing is enabled.",
  kind: "read",
  args: z.object({}),
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async execute(_args, ctx) {
    const page = await ctx.buckets.listForAccount(ctx.accountId, {
      projectId: ctx.projectId,
      includeDeleted: false,
      limit: 100,
    });
    const rows = page.items.map((b) => serializeBucket(b));
    return { text: jsonText(rows), structured: { count: rows.length } };
  },
};
