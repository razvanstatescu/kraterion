import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * B1 scaffold for the storage-reservation enforcement that ships in B6.
 *
 * Reads `StoragePool.used_encoded_bytes` vs `reserved_encoded_bytes`
 * for the request's project and logs a warning when a PUT would push
 * usage past the reservation. In B6 we'll convert the log into a 507
 * with `X-Kraterion-Reason: storage_reservation_exceeded` pointing the
 * client at the dashboard's resize flow.
 *
 * Only fires on `PUT` / `POST` to S3 object routes — reads + lists are
 * unaffected by the storage reservation.
 *
 * Cheap read (indexer-synced row, no chain call). Caches the pool row
 * implicitly via the next interceptor's bucket lookup but does its own
 * read here too; the row is small (~120 bytes) and the join is single
 * indexed equality so the cost is negligible.
 */
@Injectable()
export class PoolCapacityGuard implements CanActivate {
  private readonly logger = new Logger(PoolCapacityGuard.name);
  private readonly enforce =
    process.env["KRATERION_POOL_CAPACITY_ENFORCE"] === "true";

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (req.method !== "PUT" && req.method !== "POST") return true;

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

    const contentLength = readContentLength(req);
    const projected = pool.used_encoded_bytes + BigInt(contentLength);
    if (projected > pool.reserved_encoded_bytes) {
      if (this.enforce) {
        this.logger.warn(
          `pool-cap would-block: project=${projectId} used=${pool.used_encoded_bytes} ` +
            `reserved=${pool.reserved_encoded_bytes} projected=${projected} (KRATERION_POOL_CAPACITY_ENFORCE=true)`,
        );
        return false;
      }
      this.logger.debug(
        `pool-cap would-block: project=${projectId} used=${pool.used_encoded_bytes} ` +
          `reserved=${pool.reserved_encoded_bytes} projected=${projected} (scaffold; not enforcing)`,
      );
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
