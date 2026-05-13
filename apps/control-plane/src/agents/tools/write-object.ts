import { z } from "zod";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import type { PrismaService } from "../../prisma/prisma.service.js";
import { findBucketByName } from "./helpers.js";
import { jsonText, type ToolDef } from "./types.js";

const WRITE_BYTES_CAP = 5 * 1024 * 1024; // 5 MiB

const schema = z.object({
  bucket: z.string().min(1),
  key: z.string().min(1).max(1024),
  content: z.string().min(0).max(WRITE_BYTES_CAP),
  content_type: z
    .string()
    .max(255)
    .optional()
    .describe("Defaults to `text/plain; charset=utf-8`."),
});

export const writeObjectTool: ToolDef<typeof schema> = {
  name: "kraterion_write_object",
  label: "Write object",
  description:
    `Upload a small UTF-8 text object to a bucket. Capped at ${WRITE_BYTES_CAP} ` +
    "bytes. Triggers on-chain SharedBlob creation; the resulting Move tx " +
    "digest is captured for the audit trail.",
  kind: "write",
  args: schema,
  parameters: {
    type: "object",
    properties: {
      bucket: { type: "string" },
      key: { type: "string", minLength: 1, maxLength: 1024 },
      content: {
        type: "string",
        description: "UTF-8 text content. Capped at 5 MiB after encoding.",
      },
      content_type: {
        type: "string",
        description: "Defaults to `text/plain; charset=utf-8`.",
      },
    },
    required: ["bucket", "key", "content"],
    additionalProperties: false,
  },
  async execute({ bucket: bucketName, key, content, content_type }, ctx) {
    const bucket = await findBucketByName(ctx, bucketName);
    const contentBuf = Buffer.from(content, "utf8");
    if (contentBuf.byteLength > WRITE_BYTES_CAP) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Content is ${contentBuf.byteLength} bytes after UTF-8 encoding; cap is ${WRITE_BYTES_CAP}.`,
      );
    }
    const ct = content_type ?? "text/plain; charset=utf-8";

    // Gateway-proxied PUT. The signing key is the project's auto-minted
    // AKIA — the agent's sub_wallet is *not* in the write path. The
    // gateway encrypts via Seal, uploads ciphertext to Walrus, and
    // mints the on-chain SharedBlob; the indexer eventually populates
    // S3Object.tx_digest which we poll for below.
    const signed = await ctx.presign.signUpload({
      accountId: ctx.accountId,
      bucketId: bucket.id,
      key,
      contentType: ct,
    });
    const res = await fetch(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body: contentBuf,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new ControlPlaneError(
        "InternalError",
        `Gateway returned ${res.status} writing "${key}": ${body.slice(0, 256)}`,
      );
    }
    const etag = res.headers.get("etag") ?? null;

    // Bounded poll for the indexer to populate tx_digest. Capped at 8s
    // because P3-day workers settle in ~1-3s. If the indexer hasn't
    // caught up by then the dashboard shows "indexing…" and we leave
    // the audit row's tx_digest null — the indexer eventually back-fills
    // S3Object and the row stays consistent.
    const receipt = await awaitOnChainReceipt(ctx.prisma, bucket.id, key);

    return {
      text: jsonText({
        bucket: bucket.name,
        s3_key: key,
        content_type: ct,
        size_bytes: contentBuf.byteLength,
        etag,
        tx_digest: receipt?.tx_digest ?? null,
        walrus_blob_id: receipt?.walrus_blob_id ?? null,
        note: receipt
          ? "On-chain SharedBlob created."
          : "Write accepted; on-chain receipt still pending (indexer typically catches up within 30s).",
      }),
      structured: {
        bucket: bucket.name,
        s3_key: key,
        size_bytes: contentBuf.byteLength,
        etag,
      },
      ...(receipt?.tx_digest ? { txDigest: receipt.tx_digest } : {}),
      ...(receipt?.walrus_blob_id ? { walrusBlobId: receipt.walrus_blob_id } : {}),
      ...(receipt?.shared_blob_object_id
        ? { sharedBlobObjectId: receipt.shared_blob_object_id }
        : {}),
    };
  },
};

interface Receipt {
  tx_digest: string;
  walrus_blob_id: string | null;
  shared_blob_object_id: string | null;
}

async function awaitOnChainReceipt(
  prisma: PrismaService,
  bucketId: string,
  s3Key: string,
): Promise<Receipt | null> {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const row = await prisma.s3Object.findFirst({
      where: {
        bucket_id: bucketId,
        s3_key: s3Key,
        deleted_at: null,
      },
      orderBy: { uploaded_at: "desc" },
      select: {
        tx_digest: true,
        walrus_blob_id: true,
        shared_blob_object_id: true,
      },
    });
    if (row?.tx_digest) {
      // The indexer stores the Sui tx digest as a **base58 string** in
      // UTF-8 bytes inside the `Bytes?` column (see
      // `apps/worker/src/indexer/checkpoint-events.ts:digestToBuffer`).
      // Suiscan URLs accept the base58 form verbatim — decode the bytes
      // back to that string. `.toString("hex")` would double-encode and
      // produce ~88 nonsense hex chars.
      return {
        tx_digest: row.tx_digest.toString("utf8"),
        walrus_blob_id: row.walrus_blob_id ?? null,
        shared_blob_object_id: row.shared_blob_object_id ?? null,
      };
    }
    await sleep(250);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
