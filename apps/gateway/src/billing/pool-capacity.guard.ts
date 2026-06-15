import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { getWalrusClient, getEncodedBlobLength } from "@kraterion/walrus-client";
import { PrismaService } from "../prisma/prisma.service.js";
import { S3Error } from "../s3/s3-error.js";

/**
 * Pre-flight storage-capacity check for object writes.
 *
 * Reads `StoragePool.used_encoded_bytes` vs `reserved_encoded_bytes`
 * for the request's project and rejects a PUT that wouldn't fit — with
 * a clean S3 `InsufficientStorage` (507) instead of letting the on-chain
 * `pool_vault::register_blob` abort with `EInsufficientCapacity`
 * (which surfaced to clients as an opaque 500).
 *
 * The projection MUST be in *encoded* bytes, not raw content-length:
 * Walrus expands every blob by Reed-Solomon and adds a per-blob metadata
 * floor of ~64 MB at 1000 shards (`getEncodedBlobLength`), so a 1 KB file
 * still consumes ~64 MB of pool capacity. Projecting raw bytes (the old
 * behaviour) under-counted ~64000:1 and never tripped — which is exactly
 * why the pool filled silently.
 *
 * Only fires on `PUT` / `POST` to S3 object routes — reads + lists are
 * unaffected. Enforcement is on by default; set
 * `KRATERION_POOL_CAPACITY_ENFORCE=false` to fall back to log-only.
 */
@Injectable()
export class PoolCapacityGuard implements CanActivate {
  private readonly logger = new Logger(PoolCapacityGuard.name);
  private readonly enforce =
    process.env["KRATERION_POOL_CAPACITY_ENFORCE"] !== "false";

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (req.method !== "PUT" && req.method !== "POST") return true;

    // Only object writes consume pool capacity. The guard is also mounted
    // on the buckets controller (a PUT :bucket with no body), which must
    // NOT be blocked when the pool is full — otherwise a full project
    // couldn't even create a bucket.
    if (ctx.getClass().name !== "ObjectsWriteController") return true;

    const projectId = req.kraterion?.identity.projectId;
    if (!projectId) return true;

    const pool = await this.prisma.storagePool.findUnique({
      where: { project_id: projectId },
      select: {
        used_encoded_bytes: true,
        reserved_encoded_bytes: true,
        status: true,
      },
    });
    // No pool yet → the gateway's lazy provisioning creates one on
    // first PUT, so we let it through. Once the pool exists, the
    // capacity check kicks in.
    if (!pool) return true;
    if (pool.status !== "active") return true;

    // Project the encoded cost of this blob. `n_shards` comes from the
    // Walrus SDK's cached system state (per-epoch, no per-PUT RPC). On
    // overwrite the projection is conservative (we don't subtract the
    // blob being replaced), which only ever errs toward rejecting early.
    const contentLength = readContentLength(req);
    const nShards = (await getWalrusClient().systemState()).committee.n_shards;
    const encodedCost = BigInt(getEncodedBlobLength(contentLength, nShards));
    const projected = pool.used_encoded_bytes + encodedCost;
    if (projected > pool.reserved_encoded_bytes) {
      const usedMb = Number(pool.used_encoded_bytes / 1_048_576n);
      const capMb = Number(pool.reserved_encoded_bytes / 1_048_576n);
      this.logger.warn(
        `pool-cap ${this.enforce ? "block" : "would-block"}: project=${projectId} ` +
          `used=${pool.used_encoded_bytes} reserved=${pool.reserved_encoded_bytes} ` +
          `+encoded=${encodedCost} projected=${projected}`,
      );
      if (this.enforce) {
        throw new S3Error(
          "InsufficientStorage",
          `Storage pool is full (${usedMb} MB of ${capMb} MB used). ` +
            `Each object reserves ~64 MB of encoded capacity. ` +
            `Resize the pool from the dashboard to upload more.`,
        );
      }
    }
    return true;
  }
}

function readContentLength(req: FastifyRequest): number {
  const headers = req.headers as Record<string, string | string[] | undefined>;
  const cl = headers["content-length"];
  const v = Array.isArray(cl) ? cl[0] : cl;
  const n = v ? parseInt(v, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}
