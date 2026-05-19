import { Injectable } from "@nestjs/common";
import type { Bucket, S3Object } from "@prisma/client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { decodeCursor, encodeCursor } from "../pagination/cursor.js";
import { PrismaService } from "../prisma/prisma.service.js";

export interface ListBucketsOpts {
  projectId?: string | undefined;
  includeDeleted: boolean;
  limit: number;
  cursor?: string | undefined;
}

export interface ListObjectsOpts {
  prefix?: string | undefined;
  includeDeleted: boolean;
  limit: number;
  cursor?: string | undefined;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

/**
 * Read-only authoritative view over `Bucket` and `S3Object`. The control
 * plane is forbidden from writing either table — the indexer is the sole
 * writer (see `docs/decisions.md` "DB writes are gateway-direct today;
 * replace with event-driven indexer"). All methods here are scoped to
 * the requesting account; rows belonging to other accounts return 404
 * (don't leak existence).
 *
 * Pagination is cursor-based on the row id. We use stable secondary
 * ordering — `(created_at desc, id desc)` for buckets,
 * `(s3_key asc, id asc)` for objects — so concurrent inserts don't
 * shift offsets under a paginating client.
 */
@Injectable()
export class BucketsService {
  constructor(private readonly prisma: PrismaService) {}

  // === Bucket queries ===

  async listForAccount(accountId: string, opts: ListBucketsOpts): Promise<Page<Bucket>> {
    if (opts.projectId) {
      // Verify the project belongs to the caller — otherwise we'd happily
      // page through someone else's empty result and reveal nothing useful,
      // but better to fail loudly so misuse surfaces in tests.
      await this.assertProjectOwned(accountId, opts.projectId);
    }
    const cursor = opts.cursor ? decodeCursor(opts.cursor) : undefined;
    const where = {
      project: { account_id: accountId },
      ...(opts.projectId ? { project_id: opts.projectId } : {}),
      ...(opts.includeDeleted ? {} : { deleted_at: null }),
    };
    // Take one extra to know if there's a next page without a count query.
    const rows = await this.prisma.bucket.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: opts.limit + 1,
      ...(cursor ? { cursor: { id: cursor.after }, skip: 1 } : {}),
    });
    return makePage(rows, opts.limit);
  }

  async getOwned(
    accountId: string,
    bucketId: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<Bucket> {
    const row = await this.prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { project: { select: { account_id: true } } },
    });
    if (!row || row.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Bucket not found");
    }
    // Soft-deleted buckets are 404 by default. Pass `includeDeleted: true`
    // when the caller genuinely needs the row — admin / audit reads, the
    // disable cleanup path. Knowledge, search, ask, and agent flows
    // should never touch a deleted bucket.
    if (row.deleted_at !== null && !opts.includeDeleted) {
      throw new ControlPlaneError("NotFound", "Bucket not found");
    }
    // Strip the join so the caller gets a clean `Bucket`.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { project, ...rest } = row;
    return rest;
  }

  // === Object queries (scoped to bucket) ===

  async listObjects(
    accountId: string,
    bucketId: string,
    opts: ListObjectsOpts,
  ): Promise<Page<S3Object>> {
    // Ownership check is a single-row lookup; cheap and necessary.
    await this.getOwned(accountId, bucketId);
    const cursor = opts.cursor ? decodeCursor(opts.cursor) : undefined;
    const where = {
      bucket_id: bucketId,
      ...(opts.includeDeleted ? {} : { deleted_at: null }),
      ...(opts.prefix ? { s3_key: { startsWith: opts.prefix } } : {}),
    };
    const rows = await this.prisma.s3Object.findMany({
      where,
      orderBy: [{ s3_key: "asc" }, { id: "asc" }],
      take: opts.limit + 1,
      ...(cursor ? { cursor: { id: cursor.after }, skip: 1 } : {}),
      // `serializeObject` reads `pooled_blob.pooled_blob_object_id` for the
      // dashboard's "On-chain details" Sui-object link. Without this
      // include the FK exists but the nested object is undefined, and the
      // serializer emits `null` for every row.
      include: { pooled_blob: { select: { pooled_blob_object_id: true } } },
    });
    return makePage(rows, opts.limit);
  }

  async getObject(
    accountId: string,
    objectId: string,
  ): Promise<S3Object & { pooled_blob: { pooled_blob_object_id: string } | null }> {
    const row = await this.prisma.s3Object.findUnique({
      where: { id: objectId },
      include: {
        bucket: { select: { project: { select: { account_id: true } } } },
        // Needed by `serializeObject` — see comment in `listObjects`.
        pooled_blob: { select: { pooled_blob_object_id: true } },
      },
    });
    if (!row || row.bucket.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Object not found");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { bucket, ...rest } = row;
    return rest;
  }

  private async assertProjectOwned(accountId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { account_id: true },
    });
    if (!project || project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Project not found");
    }
  }
}

function makePage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, next_cursor: null };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1]!;
  return { items, next_cursor: encodeCursor(last.id) };
}
