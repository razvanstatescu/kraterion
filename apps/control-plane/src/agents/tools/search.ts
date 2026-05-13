import { z } from "zod";
import { findBucketByName } from "./helpers.js";
import { jsonText, type ToolDef } from "./types.js";

const schema = z.object({
  bucket: z.string().min(1).describe("Bucket name."),
  query: z.string().min(1).max(4096),
  top_k: z.number().int().min(1).max(32).optional(),
});

export const searchTool: ToolDef<typeof schema> = {
  name: "kraterion_search",
  label: "Search knowledge",
  description:
    "Hybrid BM25 + vector search over a knowledge-enabled bucket. " +
    "Returns the top chunks with content, source S3 key + ordinal, and " +
    "a SHA-256 chunk hash usable as a verifiable citation.",
  kind: "read",
  args: schema,
  parameters: {
    type: "object",
    properties: {
      bucket: { type: "string", description: "Bucket name." },
      query: { type: "string", minLength: 1, maxLength: 4096 },
      top_k: { type: "integer", minimum: 1, maximum: 32 },
    },
    required: ["bucket", "query"],
    additionalProperties: false,
  },
  async execute({ bucket: bucketName, query, top_k }, ctx) {
    const bucket = await findBucketByName(ctx, bucketName);
    const result = await ctx.knowledge.search({
      accountId: ctx.accountId,
      bucketId: bucket.id,
      query,
      ...(top_k !== undefined ? { topK: top_k } : {}),
    });
    // Audit row mirrors what the MCP / direct knowledge endpoint write.
    // We tag the api_key_id from the principal when present (bearer
    // auth); session-auth invocations leave it null.
    await ctx.knowledge.recordQuery({
      bucketId: bucket.id,
      projectId: ctx.projectId,
      apiKeyId: ctx.apiKeyId ?? null,
      kind: "search",
      query,
      topK: top_k ?? 8,
      latencyMs: result.latency_ms,
      chunkHashes: result.hits.map((h) => h.content_hash),
    });
    return {
      text: jsonText(result),
      structured: { hit_count: result.hits.length, bucket: bucket.name },
    };
  },
};
