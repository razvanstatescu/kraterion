import { z } from "zod";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { findBucketByName } from "./helpers.js";
import { jsonText, type ToolDef } from "./types.js";

const READ_BYTES_CAP = 1 * 1024 * 1024; // 1 MiB

const schema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1).max(1024),
});

export const readObjectTool: ToolDef<typeof schema> = {
  name: "kraterion_read_object",
  label: "Read object",
  description:
    `Fetch an object's content as UTF-8 text. Capped at ${READ_BYTES_CAP} bytes — ` +
    "use kraterion_search for larger objects. Binary content is " +
    "base64-encoded.",
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
    if (Number(object.size_bytes) > READ_BYTES_CAP) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Object is ${object.size_bytes} bytes — read_object caps responses at ` +
          `${READ_BYTES_CAP}. Use kraterion_search to retrieve relevant chunks instead.`,
      );
    }

    const signed = await ctx.presign.signDownload({
      accountId: ctx.accountId,
      objectId: object.id,
    });
    const res = await fetch(signed.url, {
      method: "GET",
      headers: signed.headers,
    });
    if (!res.ok) {
      throw new ControlPlaneError(
        "InternalError",
        `Gateway returned ${res.status} reading "${key}"`,
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const ct = (object.content_type ?? "").toLowerCase();
    const looksTextual =
      ct.startsWith("text/") ||
      ct === "application/json" ||
      ct === "application/xml" ||
      ct === "application/x-yaml" ||
      ct === "application/javascript";
    if (looksTextual) {
      return {
        text: jsonText({
          s3_key: object.s3_key,
          content_type: object.content_type,
          content: buf.toString("utf8"),
          encoding: "utf-8",
          size_bytes: buf.byteLength,
        }),
        structured: { size_bytes: buf.byteLength, content_type: object.content_type },
      };
    }
    return {
      text: jsonText({
        s3_key: object.s3_key,
        content_type: object.content_type,
        content_base64: buf.toString("base64"),
        encoding: "base64",
        size_bytes: buf.byteLength,
      }),
      structured: { size_bytes: buf.byteLength, content_type: object.content_type },
    };
  },
};
