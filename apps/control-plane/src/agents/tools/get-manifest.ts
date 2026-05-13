import { z } from "zod";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { findBucketByName } from "./helpers.js";
import { jsonText, type ToolDef } from "./types.js";

const schema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1).max(1024),
});

export const getManifestTool: ToolDef<typeof schema> = {
  name: "kraterion_get_manifest",
  label: "Get manifest",
  description:
    "Fetch the knowledge indexing manifest for an object — chunk count, " +
    "embedding model, indexer status, and the Walrus blob id of the " +
    "on-chain manifest archive. Use this to verify how chunks were " +
    "derived from cited content.",
  kind: "read",
  args: schema,
  parameters: {
    type: "object",
    properties: {
      bucket: { type: "string" },
      key: { type: "string", minLength: 1, maxLength: 1024 },
    },
    required: ["bucket", "key"],
    additionalProperties: false,
  },
  async execute({ bucket: bucketName, key }, ctx) {
    const bucket = await findBucketByName(ctx, bucketName);
    const object = await ctx.prisma.s3Object.findFirst({
      where: { bucket_id: bucket.id, s3_key: key, deleted_at: null },
    });
    if (!object) {
      throw new ControlPlaneError(
        "NotFound",
        `Object "${key}" not found in "${bucketName}"`,
      );
    }
    const manifest = await ctx.prisma.knowledgeManifest.findFirst({
      where: { s3_object_id: object.id, deleted_at: null },
      orderBy: { version: "desc" },
    });
    if (!manifest) {
      return {
        text: jsonText({
          indexed: false,
          note:
            "No knowledge manifest for this object. Enable knowledge on " +
            "the bucket and re-upload (or trigger a backfill) to index it.",
        }),
        structured: { indexed: false },
      };
    }
    return {
      text: jsonText({
        indexed: true,
        manifest: {
          version: manifest.version,
          status: manifest.status,
          skip_reason: manifest.skip_reason,
          chunk_count: manifest.chunk_count,
          embedding_model: manifest.embedding_model,
          embedding_dimensions: manifest.embedding_dimensions,
          embedding_tokens: manifest.embedding_tokens,
          bytes_in: manifest.bytes_in.toString(),
          bytes_indexed: manifest.bytes_indexed.toString(),
          walrus_blob_id: manifest.manifest_walrus_blob_id,
          shared_blob_object_id: manifest.manifest_shared_blob_object_id,
          started_at: manifest.started_at?.toISOString() ?? null,
          finished_at: manifest.finished_at?.toISOString() ?? null,
        },
      }),
      structured: {
        indexed: true,
        chunk_count: manifest.chunk_count,
        status: manifest.status,
      },
    };
  },
};
