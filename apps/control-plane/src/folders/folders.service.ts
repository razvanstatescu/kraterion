import { Injectable } from "@nestjs/common";
import { Prisma, type FolderMarker } from "@prisma/client";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Folder markers are a dashboard-side affordance — they let users
 * pre-create an empty folder before uploading anything into it. There
 * is no on-chain footprint and no Walrus/Seal cost; we trade S3-client
 * interop (boto3 won't see an empty folder) for instant feedback and
 * zero gas.
 *
 * See `prisma/schema.prisma` `model FolderMarker` for the rationale.
 */
@Injectable()
export class FoldersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buckets: BucketsService,
  ) {}

  /**
   * Normalize a parent prefix to either `""` (root) or `"<path>/"`.
   * Idempotent — accepts user input with or without a trailing slash,
   * collapses repeated slashes, and rejects anything that escapes the
   * bucket root.
   */
  static normalizeParent(raw: string): string {
    if (!raw) return "";
    let p = raw.replace(/\/+/g, "/");
    if (p.startsWith("/")) p = p.slice(1);
    if (!p) return "";
    if (!p.endsWith("/")) p = `${p}/`;
    return p;
  }

  /**
   * Compose the final stored prefix from parent + name. Caller has
   * already validated that name contains no `/`, but we re-assert here
   * because this function is the single source of truth for the on-disk
   * key shape.
   */
  static composePrefix(parent: string, name: string): string {
    const p = FoldersService.normalizeParent(parent);
    const n = name.trim();
    if (!n || n.includes("/")) {
      throw new ControlPlaneError("InvalidArgument", "Invalid folder name.");
    }
    const full = `${p}${n}/`;
    if (full.length > 1024) {
      throw new ControlPlaneError("InvalidArgument", "Folder path is too long.");
    }
    return full;
  }

  async list(accountId: string, bucketId: string, opts: { prefix?: string | undefined }): Promise<FolderMarker[]> {
    // Ownership check — same shape as listObjects. 404 on mismatch so we
    // never leak existence of a bucket the caller doesn't own.
    await this.buckets.getOwned(accountId, bucketId);
    return this.prisma.folderMarker.findMany({
      where: {
        bucket_id: bucketId,
        ...(opts.prefix ? { prefix: { startsWith: opts.prefix } } : {}),
      },
      orderBy: { prefix: "asc" },
    });
  }

  async create(args: {
    accountId: string;
    bucketId: string;
    parentPrefix: string;
    name: string;
  }): Promise<FolderMarker> {
    await this.buckets.getOwned(args.accountId, args.bucketId);
    const prefix = FoldersService.composePrefix(args.parentPrefix, args.name);
    try {
      return await this.prisma.folderMarker.create({
        data: { bucket_id: args.bucketId, prefix },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Idempotent from the user's POV — just return the existing row.
        // Their click effectively succeeded.
        const existing = await this.prisma.folderMarker.findUnique({
          where: { bucket_id_prefix: { bucket_id: args.bucketId, prefix } },
        });
        if (existing) return existing;
      }
      throw err;
    }
  }

  async deleteById(accountId: string, bucketId: string, markerId: string): Promise<void> {
    await this.buckets.getOwned(accountId, bucketId);
    // updateMany so the missing-row case is a no-op 204, not a 500.
    await this.prisma.folderMarker.deleteMany({
      where: { id: markerId, bucket_id: bucketId },
    });
  }

  /**
   * Cheap preview for the "Delete folder" dialog. Returns the count of
   * live (non-soft-deleted) objects under the prefix so the UI can:
   *   - skip the typed-confirm step when count == 0
   *   - show "delete N objects" when count > 0
   *
   * Uses `.count` which is a single COUNT(*) over the partial-index path.
   */
  async previewPurge(args: {
    accountId: string;
    bucketId: string;
    prefix: string;
  }): Promise<{ object_count: number; marker_count: number }> {
    await this.buckets.getOwned(args.accountId, args.bucketId);
    const [object_count, marker_count] = await Promise.all([
      this.prisma.s3Object.count({
        where: {
          bucket_id: args.bucketId,
          s3_key: { startsWith: args.prefix },
          deleted_at: null,
        },
      }),
      this.prisma.folderMarker.count({
        where: { bucket_id: args.bucketId, prefix: { startsWith: args.prefix } },
      }),
    ]);
    return { object_count, marker_count };
  }

  /**
   * Recursive soft-delete of every object under the prefix, plus removal
   * of any folder markers (the deleted one itself + nested ones). Returns
   * counts for the response toast.
   *
   * What this does NOT do — on purpose:
   *   - On-chain SharedBlobs persist (their funding pools keep paying
   *     Walrus storage until they expire). That's the whole product
   *     claim: your files outlive the platform.
   *   - No event is emitted; the indexer doesn't care about soft-deletes
   *     (it only writes inserts/updates on Move events).
   *
   * Both operations run in one transaction so the user never observes
   * an intermediate "files gone, marker still there" state.
   */
  async purge(args: {
    accountId: string;
    bucketId: string;
    prefix: string;
  }): Promise<{ objects_deleted: number; markers_deleted: number }> {
    await this.buckets.getOwned(args.accountId, args.bucketId);
    const now = new Date();
    const [objs, markers] = await this.prisma.$transaction([
      this.prisma.s3Object.updateMany({
        where: {
          bucket_id: args.bucketId,
          s3_key: { startsWith: args.prefix },
          deleted_at: null,
        },
        data: { deleted_at: now },
      }),
      this.prisma.folderMarker.deleteMany({
        where: { bucket_id: args.bucketId, prefix: { startsWith: args.prefix } },
      }),
    ]);
    return { objects_deleted: objs.count, markers_deleted: markers.count };
  }
}
