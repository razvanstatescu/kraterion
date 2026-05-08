import { Logger } from "@nestjs/common";
import type { S3Object } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { S3Error } from "../s3/s3-error.js";

const POLL_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Poll Postgres for the `S3Object` row the indexer should produce
 * after observing the `KraterionObjectCreated` event for the given
 * SharedBlob. Returns once the row appears OR throws
 * `ServiceUnavailable` after `timeoutMs`.
 *
 * This is the gateway's hand-off to the indexer. After the gateway's
 * PTB 2 lands successfully on chain, the indexer's gRPC stream picks
 * up the event in the next checkpoint (~3s testnet finality + ~1s
 * indexer poll). Most calls return well under 5s; the 15s default
 * leaves headroom for testnet jitter.
 *
 * If we time out, the data IS on chain but the indexer hasn't
 * reflected it yet — boto3 sees 503 and retries. By the time it
 * retries, the indexer has caught up and the next call returns the
 * row immediately.
 */
const logger = new Logger("waitForS3Object");

export async function waitForS3Object(
  prisma: PrismaService,
  sharedBlobObjectId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<S3Object> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await prisma.s3Object.findUnique({
      where: { shared_blob_object_id: sharedBlobObjectId },
    });
    if (row) {
      const elapsed = Date.now() - start;
      if (elapsed > 1000) {
        logger.log(`S3Object row appeared after ${elapsed}ms (shared=${sharedBlobObjectId.slice(0, 12)}…)`);
      }
      return row;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  logger.error(
    `S3Object row never appeared after ${timeoutMs}ms (shared=${sharedBlobObjectId})`,
  );
  throw new S3Error(
    "ServiceUnavailable",
    "Storage commit succeeded on-chain but the indexer hasn't caught up. Retry the request.",
  );
}

/** Same shape but for `Bucket` — used by the bootstrap script. */
export async function waitForBucket(
  prisma: PrismaService,
  kraterionBucketObjectId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ id: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = await prisma.bucket.findUnique({
      where: { kraterion_bucket_object_id: kraterionBucketObjectId },
      select: { id: true },
    });
    if (row) return row;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new S3Error(
    "ServiceUnavailable",
    "Bucket created on-chain but the indexer hasn't caught up.",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
