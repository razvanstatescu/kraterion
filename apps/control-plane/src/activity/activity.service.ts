import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

export type ActivityEventKind =
  | "bucket_created"
  | "bucket_deleted"
  | "object_uploaded"
  | "object_deleted"
  | "knowledge_search"
  | "knowledge_ask";

/**
 * Wire shape for `/v1/activity`. One row per state change a user can
 * inspect. `bucket` is always present; `object` only on object events.
 * `tx_digest` is best-effort — the indexer populates it for events with
 * an on-chain origin (bucket-create, object-upload) so the dashboard
 * can render a Suiscan link; null for soft-deletes (DB-only).
 *
 * `knowledge` lights up for `knowledge_search` / `knowledge_ask` rows
 * sourced from `KnowledgeQuery`. It carries the actual query string
 * (truncated upstream if needed) plus the retrieval shape so the
 * dashboard can render it without a follow-up fetch.
 */
export interface ActivityEventJson {
  id: string;
  kind: ActivityEventKind;
  at: string;
  tx_digest: string | null;
  bucket: {
    id: string;
    name: string;
    encryption_mode: "private" | "public-read";
  };
  object: {
    id: string;
    s3_key: string;
    content_type: string | null;
    size_bytes: string;
  } | null;
  knowledge: {
    query: string;
    top_k: number;
    chunk_count: number;
    latency_ms: number;
    llm_model: string | null;
    llm_tokens: number | null;
  } | null;
}

/**
 * Aggregates the user-visible event stream from `Bucket` and `S3Object`.
 *
 * Strategy: pull a bounded window from each table (last `limit * 2`
 * rows, ordered by their primary timestamp), materialise creation +
 * soft-delete events client-side, sort the union by timestamp, return
 * the head `limit` rows. Cheap enough for the typical < few-hundred
 * objects per account in v1; if usage grows we'd push this into a
 * dedicated append-only events table populated by the indexer.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(accountId: string, opts: { limit: number }): Promise<ActivityEventJson[]> {
    // 2× overshoot per table so deletions of older rows still bubble to
    // the top once their `deleted_at` lands in the past `limit` window.
    const fetchSize = Math.max(opts.limit * 2, 20);

    const [buckets, objects, queries] = await Promise.all([
      this.prisma.bucket.findMany({
        where: { project: { account_id: accountId } },
        orderBy: { created_at: "desc" },
        take: fetchSize,
      }),
      this.prisma.s3Object.findMany({
        where: { bucket: { project: { account_id: accountId } } },
        include: {
          bucket: {
            select: { id: true, name: true, encryption_mode: true },
          },
        },
        orderBy: { uploaded_at: "desc" },
        take: fetchSize,
      }),
      this.prisma.knowledgeQuery.findMany({
        where: { bucket: { project: { account_id: accountId } } },
        include: {
          bucket: {
            select: { id: true, name: true, encryption_mode: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: fetchSize,
      }),
    ]);

    const events: ActivityEventJson[] = [];
    for (const b of buckets) {
      events.push({
        id: `bc-${b.id}`,
        kind: "bucket_created",
        at: b.created_at.toISOString(),
        tx_digest: digestToHex(b.tx_digest),
        bucket: {
          id: b.id,
          name: b.name,
          encryption_mode: b.encryption_mode as "private" | "public-read",
        },
        object: null,
        knowledge: null,
      });
      if (b.deleted_at) {
        events.push({
          id: `bd-${b.id}`,
          kind: "bucket_deleted",
          at: b.deleted_at.toISOString(),
          tx_digest: null,
          bucket: {
            id: b.id,
            name: b.name,
            encryption_mode: b.encryption_mode as "private" | "public-read",
          },
          object: null,
          knowledge: null,
        });
      }
    }
    for (const o of objects) {
      const objMeta = {
        id: o.id,
        s3_key: o.s3_key,
        content_type: o.content_type,
        size_bytes: o.size_bytes.toString(),
      };
      const bucketMeta = {
        id: o.bucket.id,
        name: o.bucket.name,
        encryption_mode: o.bucket.encryption_mode as "private" | "public-read",
      };
      events.push({
        id: `ou-${o.id}`,
        kind: "object_uploaded",
        at: o.uploaded_at.toISOString(),
        tx_digest: digestToHex(o.tx_digest),
        bucket: bucketMeta,
        object: objMeta,
        knowledge: null,
      });
      if (o.deleted_at) {
        events.push({
          id: `od-${o.id}`,
          kind: "object_deleted",
          at: o.deleted_at.toISOString(),
          tx_digest: null,
          bucket: bucketMeta,
          object: objMeta,
          knowledge: null,
        });
      }
    }
    for (const q of queries) {
      const isAsk = q.kind === "ask";
      events.push({
        id: `kq-${q.id}`,
        kind: isAsk ? "knowledge_ask" : "knowledge_search",
        at: q.created_at.toISOString(),
        tx_digest: null,
        bucket: {
          id: q.bucket.id,
          name: q.bucket.name,
          encryption_mode: q.bucket.encryption_mode as "private" | "public-read",
        },
        object: null,
        knowledge: {
          query: q.query,
          top_k: q.top_k,
          chunk_count: q.chunk_count,
          latency_ms: q.latency_ms,
          llm_model: q.llm_model,
          llm_tokens: q.llm_tokens,
        },
      });
    }

    events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return events.slice(0, opts.limit);
  }
}

/**
 * `Bucket.tx_digest` / `S3Object.tx_digest` are stored as Postgres
 * `bytea` for indexer-rewritten rows. The dashboard wants hex, so the
 * Suiscan link works directly — and pre-indexer rows have NULL, which
 * we surface as a null on the wire.
 */
function digestToHex(digest: Buffer | Uint8Array | null): string | null {
  if (!digest) return null;
  return `0x${Buffer.from(digest).toString("hex")}`;
}
