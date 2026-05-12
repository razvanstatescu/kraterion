import type { Bucket, S3Object } from "@prisma/client";

/**
 * Wire-shape of `Bucket` for control-plane responses. Drops indexer
 * provenance (`tx_digest`, `event_seq`, `event_payload`) — those are
 * internal — and stringifies the BigInt funding_pool balance because
 * `JSON.stringify(BigInt)` throws.
 */
export interface BucketJson {
  id: string;
  project_id: string;
  name: string;
  region: string;
  encryption_mode: "private" | "public-read";
  kraterion_bucket_object_id: string;
  api_access_granted: boolean;
  funding_pool_wal: string;
  created_at: string;
  deleted_at: string | null;
  /**
   * Whether Knowledge indexing is on for this bucket. The CP joins
   * `KnowledgeBucketSettings` in the list/get paths so the dashboard
   * can badge enabled buckets without an N+1 follow-up.
   */
  knowledge_enabled?: boolean;
}

export function serializeBucket(
  b: Bucket,
  opts?: { knowledgeEnabled?: boolean },
): BucketJson {
  return {
    id: b.id,
    project_id: b.project_id,
    name: b.name,
    region: b.region,
    encryption_mode: b.encryption_mode as "private" | "public-read",
    kraterion_bucket_object_id: b.kraterion_bucket_object_id,
    api_access_granted: b.api_access_granted,
    funding_pool_wal: b.funding_pool_wal_balance.toString(),
    created_at: b.created_at.toISOString(),
    deleted_at: b.deleted_at ? b.deleted_at.toISOString() : null,
    ...(opts?.knowledgeEnabled !== undefined
      ? { knowledge_enabled: opts.knowledgeEnabled }
      : {}),
  };
}

/**
 * Wire-shape of `S3Object`. Same redaction rules; `seal_identity` is
 * encoded as base64 because the dashboard wants to display it in the
 * "On-chain details" expander.
 */
export interface S3ObjectJson {
  id: string;
  bucket_id: string;
  s3_key: string;
  size_bytes: string;
  content_type: string | null;
  etag: string;
  walrus_blob_id: string;
  shared_blob_object_id: string;
  storage_end_epoch: number;
  seal_identity_b64: string;
  /** User-provided `x-amz-meta-*` headers captured at PUT time. */
  metadata: Record<string, string> | null;
  uploaded_at: string;
  deleted_at: string | null;
}

export function serializeObject(o: S3Object): S3ObjectJson {
  return {
    id: o.id,
    bucket_id: o.bucket_id,
    s3_key: o.s3_key,
    size_bytes: o.size_bytes.toString(),
    content_type: o.content_type,
    etag: o.etag,
    walrus_blob_id: o.walrus_blob_id,
    shared_blob_object_id: o.shared_blob_object_id,
    storage_end_epoch: o.storage_end_epoch,
    seal_identity_b64: Buffer.from(o.seal_identity).toString("base64"),
    metadata: filterStringMap(o.metadata),
    uploaded_at: o.uploaded_at.toISOString(),
    deleted_at: o.deleted_at ? o.deleted_at.toISOString() : null,
  };
}

function filterStringMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}
