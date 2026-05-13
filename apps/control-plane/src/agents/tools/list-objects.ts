import { z } from "zod";
import { serializeObject } from "../../buckets/serialize.js";
import { findBucketByName } from "./helpers.js";
import { jsonText, type ToolDef } from "./types.js";

const schema = z.object({
  bucket: z.string().min(1).describe("Bucket name."),
  prefix: z.string().optional().describe("S3 key prefix filter."),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const listObjectsTool: ToolDef<typeof schema> = {
  name: "kraterion_list_objects",
  label: "List objects",
  description:
    "List objects in a bucket, optionally filtered by a key prefix. " +
    "Returns up to 100 objects per call.",
  kind: "read",
  args: schema,
  parameters: {
    type: "object",
    properties: {
      bucket: { type: "string", description: "Bucket name." },
      prefix: { type: "string", description: "S3 key prefix filter." },
      limit: { type: "integer", minimum: 1, maximum: 1000 },
    },
    required: ["bucket"],
    additionalProperties: false,
  },
  async execute({ bucket: bucketName, prefix, limit }, ctx) {
    const bucket = await findBucketByName(ctx, bucketName);
    const page = await ctx.buckets.listObjects(ctx.accountId, bucket.id, {
      includeDeleted: false,
      limit: limit ?? 100,
      ...(prefix ? { prefix } : {}),
    });
    return {
      text: jsonText({
        bucket: bucket.name,
        objects: page.items.map(serializeObject),
        next_cursor: page.next_cursor,
      }),
      structured: { count: page.items.length, bucket: bucket.name },
    };
  },
};
