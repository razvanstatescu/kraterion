/**
 * `GET /:bucket` — ListObjectsV2 (and a routing decision tree for the
 * other shapes that `GET /:bucket` covers).
 *
 * Decision tree:
 *   1. If a known sub-resource query param is present (`?location`,
 *      `?versioning`, `?lifecycle`, `?acl`, …) → 501 `NotImplemented`
 *      with the sub-resource named in the message. None of these are
 *      implemented in v1.
 *   2. If `list-type=2` is present → ListObjectsV2 (this file's main
 *      job).
 *   3. Otherwise → 501 `NotImplemented` for ListObjectsV1; clients
 *      must call `list_objects_v2` (boto3) or set `list-type=2`.
 *
 * V2 query params honored (per
 * https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html):
 *   - `prefix`           — substring filter; default empty.
 *   - `delimiter`        — group keys with the delimiter into
 *                          `<CommonPrefixes>` entries; empty string
 *                          treated as absent.
 *   - `max-keys`         — clamp to [0, 1000]; default 1000. AWS
 *                          silently clamps; we mirror that.
 *   - `continuation-token` — resume from where a prior page left off.
 *                          Wins over `start-after` when both supplied
 *                          (per AWS docs).
 *   - `start-after`      — alternative resume cursor; ignored if
 *                          `continuation-token` is also set.
 *   - `encoding-type=url` — URL-encode `<Key>`, `<Prefix>`,
 *                          `<Delimiter>`, `<StartAfter>`,
 *                          `<CommonPrefixes><Prefix>` in the response.
 *   - `fetch-owner=true` — include `<Owner>` in each `<Contents>`
 *                          entry. We populate it with `accountId`
 *                          (no separate display name yet).
 *
 * Sort order:
 *   AWS specifies byte-wise UTF-8 ascending. Postgres `text` defaults
 *   to a locale-aware collation, so `s3_key` was migrated to `COLLATE
 *   "C"` (byte-wise) — see `migrations/.../s3object_skey_collate_c`.
 *   Prisma's `orderBy: { s3_key: 'asc' }` then naturally produces
 *   AWS-equivalent ordering, including indexes on `(bucket_id,
 *   s3_key)`.
 *
 * Continuation token:
 *   Opaque to clients; internally `base64url(JSON({ v: 1, kind:
 *   "key"|"prefix", value }))`. `kind: "prefix"` cursors carry the
 *   common prefix and resume by querying `s3_key >=
 *   commonPrefixSuccessor(value)`, which skips every key under that
 *   common prefix without re-emitting it. `kind: "key"` cursors use
 *   strict `>` for normal between-Contents pagination.
 */

import { Controller, Get, Header, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { Sigv4Guard } from "../auth/sigv4/sigv4.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { S3Error } from "./s3-error.js";
import { requireKraterion, requireBucket } from "./request-context.js";
import type { KraterionRequestContext } from "../auth/sigv4/types.js";
import type { Prisma } from "@prisma/client";

// Bare-flag query params boto3/aws-cli send for various GET-on-bucket
// sub-resource APIs. Presence of any of these (regardless of value)
// short-circuits to NotImplemented before we even consider list-type.
const SUB_RESOURCE_PARAMS = new Set([
  "location",
  "versioning",
  "lifecycle",
  "policy",
  "cors",
  "tagging",
  "logging",
  "acl",
  "notification",
  "replication",
  "inventory",
  "metrics",
  "analytics",
  "accelerate",
  "encryption",
  "object-lock",
  "ownershipControls",
  "publicAccessBlock",
  "requestPayment",
  "website",
  "uploads",
  "versions",
  "policyStatus",
  "attributes",
]);

const MAX_KEYS_DEFAULT = 1000;
const MAX_KEYS_HARD_LIMIT = 1000;
// Bound on per-request DB fetch when delimiter rolls up many keys into
// few CommonPrefixes. 10× MaxKeys covers the realistic case (each CP
// rolls up ≤10 keys on average); fall back to NextContinuationToken if
// we exceed.
const FETCH_MULTIPLIER = 10;
const FETCH_HARD_LIMIT = 10_000;

const OBJECT_SELECT = {
  s3_key: true,
  size_bytes: true,
  etag: true,
  uploaded_at: true,
} satisfies Prisma.S3ObjectSelect;

type ObjectRow = Prisma.S3ObjectGetPayload<{ select: typeof OBJECT_SELECT }>;

interface Cursor {
  kind: "key" | "prefix";
  value: string;
}

interface ListParams {
  prefix: string;
  delimiter: string | undefined;
  maxKeys: number;
  continuationToken: string | undefined;
  startAfter: string | undefined;
  encodingType: "url" | undefined;
  fetchOwner: boolean;
}

@UseGuards(Sigv4Guard)
@Controller()
export class ObjectsListController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":bucket")
  @Header("Content-Type", "application/xml")
  async dispatch(@Req() req: FastifyRequest): Promise<string> {
    const ctx = requireKraterion(req);
    const bucketName = requireBucket(ctx);
    const query = (req.query ?? {}) as Record<string, string | string[] | undefined>;

    for (const sub of SUB_RESOURCE_PARAMS) {
      if (sub in query) {
        throw new S3Error(
          "NotImplemented",
          `Bucket sub-resource '${sub}' is not implemented in this phase.`,
        );
      }
    }

    const listType = singleVal(query, "list-type");
    if (listType !== "2") {
      throw new S3Error(
        "NotImplemented",
        "ListObjectsV1 is not supported. Set list-type=2 (or use list_objects_v2 in boto3).",
      );
    }

    const params = parseListParams(query);
    return this.listObjectsV2(ctx, bucketName, params);
  }

  private async listObjectsV2(
    ctx: KraterionRequestContext,
    bucketName: string,
    params: ListParams,
  ): Promise<string> {
    const bucket = await this.prisma.bucket.findFirst({
      where: {
        name: bucketName,
        deleted_at: null,
        project: { account_id: ctx.identity.accountId },
      },
      select: { id: true, name: true },
    });
    if (!bucket) {
      throw new S3Error("NoSuchBucket", "The specified bucket does not exist.");
    }

    // Resolve the cursor: continuation-token wins over start-after when
    // both are present (AWS docs).
    let cursor: Cursor | null = null;
    if (params.continuationToken !== undefined) {
      cursor = decodeContinuationToken(params.continuationToken);
    } else if (params.startAfter !== undefined) {
      cursor = { kind: "key", value: params.startAfter };
    }

    // Short-circuit: max-keys=0 returns an empty page with
    // `IsTruncated=false`. Postgres roundtrip skipped.
    if (params.maxKeys === 0) {
      return renderListBucketResult({
        bucketName: bucket.name,
        params,
        contents: [],
        commonPrefixes: [],
        truncated: false,
        nextContinuationToken: null,
        ownerId: ctx.identity.accountId,
      });
    }

    const fetchLimit = Math.min(params.maxKeys * FETCH_MULTIPLIER + 1, FETCH_HARD_LIMIT);
    const where = buildWhereClause(bucket.id, params.prefix, cursor);
    const rows = await this.prisma.s3Object.findMany({
      where,
      orderBy: { s3_key: "asc" },
      take: fetchLimit,
      select: OBJECT_SELECT,
    });

    const { contents, commonPrefixes, nextCursor, truncated } = groupAndPaginate(
      rows,
      params.prefix,
      params.delimiter,
      params.maxKeys,
      rows.length === fetchLimit,
    );

    return renderListBucketResult({
      bucketName: bucket.name,
      params,
      contents,
      commonPrefixes,
      truncated,
      nextContinuationToken: truncated && nextCursor ? encodeContinuationToken(nextCursor) : null,
      ownerId: ctx.identity.accountId,
    });
  }
}

// ===== Param parsing =====

function singleVal(
  query: Record<string, string | string[] | undefined>,
  k: string,
): string | undefined {
  const v = query[k];
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseListParams(
  query: Record<string, string | string[] | undefined>,
): ListParams {
  const prefix = singleVal(query, "prefix") ?? "";
  const delimiterRaw = singleVal(query, "delimiter");
  const delimiter = delimiterRaw && delimiterRaw.length > 0 ? delimiterRaw : undefined;
  const continuationToken = singleVal(query, "continuation-token");
  const startAfter = singleVal(query, "start-after");
  const encodingTypeRaw = singleVal(query, "encoding-type");
  const fetchOwnerRaw = singleVal(query, "fetch-owner");

  if (encodingTypeRaw !== undefined && encodingTypeRaw !== "url") {
    throw new S3Error(
      "InvalidArgument",
      "Invalid encoding-type. The only supported value is 'url'.",
    );
  }
  const encodingType = encodingTypeRaw === "url" ? "url" : undefined;

  let maxKeys = MAX_KEYS_DEFAULT;
  const maxKeysRaw = singleVal(query, "max-keys");
  if (maxKeysRaw !== undefined) {
    const n = Number(maxKeysRaw);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      throw new S3Error("InvalidArgument", "max-keys must be a non-negative integer.");
    }
    maxKeys = Math.min(n, MAX_KEYS_HARD_LIMIT);
  }

  return {
    prefix,
    delimiter,
    maxKeys,
    continuationToken,
    startAfter,
    encodingType,
    fetchOwner: fetchOwnerRaw === "true",
  };
}

// ===== Cursor codec =====

function encodeContinuationToken(cursor: Cursor): string {
  const json = JSON.stringify({ v: 1, kind: cursor.kind, value: cursor.value });
  return Buffer.from(json, "utf8").toString("base64url");
}

function decodeContinuationToken(token: string): Cursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    parsed = JSON.parse(json);
  } catch {
    throw new S3Error("InvalidArgument", "The continuation token provided is incorrect.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { v?: number }).v !== 1 ||
    !["key", "prefix"].includes((parsed as { kind?: string }).kind ?? "") ||
    typeof (parsed as { value?: unknown }).value !== "string"
  ) {
    throw new S3Error("InvalidArgument", "The continuation token provided is incorrect.");
  }
  const p = parsed as { kind: "key" | "prefix"; value: string };
  return { kind: p.kind, value: p.value };
}

// ===== Where-clause + cursor advance =====

function buildWhereClause(
  bucketId: string,
  prefix: string,
  cursor: Cursor | null,
): Prisma.S3ObjectWhereInput {
  const keyClauses: Prisma.StringFilter<"S3Object"> = {};
  if (prefix.length > 0) keyClauses.startsWith = prefix;
  if (cursor) {
    if (cursor.kind === "key") {
      keyClauses.gt = cursor.value;
    } else {
      // Skip past the entire common-prefix range.
      keyClauses.gte = commonPrefixSuccessor(cursor.value);
    }
  }
  return {
    bucket_id: bucketId,
    deleted_at: null,
    ...(Object.keys(keyClauses).length > 0 ? { s3_key: keyClauses } : {}),
  };
}

/**
 * Smallest string T (byte-wise) such that T does not start with `cp`
 * AND T > cp. Increment the last byte of `cp`; if it's 0xFF, carry
 * upward.
 *
 * For ASCII delimiters (the realistic case) this stays valid UTF-8.
 * For pathological all-0xFF inputs we append 0x00 — produces a string
 * that no real key would start with, so it's still a sound skip.
 */
function commonPrefixSuccessor(cp: string): string {
  const buf = Buffer.from(cp, "utf8");
  for (let i = buf.length - 1; i >= 0; i--) {
    if (buf[i]! < 0xff) {
      const out = Buffer.alloc(i + 1);
      buf.copy(out, 0, 0, i + 1);
      out[i] = out[i]! + 1;
      // Note: `latin1` (a.k.a. `binary`) preserves byte values 0x80-
      // 0xFF that aren't valid as UTF-8 start bytes. The Postgres
      // text column has `COLLATE "C"` so it compares byte-wise; the
      // string just needs to be a valid pg text value, which it is
      // (text accepts any non-NUL byte sequence).
      return out.toString("latin1");
    }
  }
  return cp + " ";
}

// ===== Grouping + pagination =====

interface GroupResult {
  contents: ObjectRow[];
  commonPrefixes: string[];
  nextCursor: Cursor | null;
  truncated: boolean;
}

function groupAndPaginate(
  rows: ObjectRow[],
  prefix: string,
  delimiter: string | undefined,
  maxKeys: number,
  fetchHitLimit: boolean,
): GroupResult {
  const contents: ObjectRow[] = [];
  const commonPrefixes: string[] = [];
  const seenCp = new Set<string>();
  let nextCursor: Cursor | null = null;
  let truncated = false;

  for (const row of rows) {
    const afterPrefix = row.s3_key.slice(prefix.length);
    const delimIdx = delimiter ? afterPrefix.indexOf(delimiter) : -1;

    if (delimIdx >= 0) {
      const cp = prefix + afterPrefix.slice(0, delimIdx + delimiter!.length);
      if (seenCp.has(cp)) {
        // Already emitted on this page; just iterate past.
        continue;
      }
      if (contents.length + commonPrefixes.length >= maxKeys) {
        truncated = true;
        break;
      }
      commonPrefixes.push(cp);
      seenCp.add(cp);
      // If the page ends here, the next request must skip the entire
      // common-prefix range — record `kind: "prefix"`.
      nextCursor = { kind: "prefix", value: cp };
    } else {
      if (contents.length + commonPrefixes.length >= maxKeys) {
        truncated = true;
        break;
      }
      contents.push(row);
      nextCursor = { kind: "key", value: row.s3_key };
    }
  }

  // Edge case: we hit `fetchLimit` but never overflowed maxKeys. Could
  // be exactly enough, could be more keys we never saw. Be safe and
  // mark truncated so the client can ask again.
  if (!truncated && fetchHitLimit && nextCursor) {
    truncated = true;
  }

  if (!truncated) nextCursor = null;
  return { contents, commonPrefixes, nextCursor, truncated };
}

// ===== XML rendering =====

interface RenderInput {
  bucketName: string;
  params: ListParams;
  contents: ObjectRow[];
  commonPrefixes: string[];
  truncated: boolean;
  nextContinuationToken: string | null;
  ownerId: string;
}

function renderListBucketResult(input: RenderInput): string {
  const { params } = input;
  const enc = params.encodingType === "url";

  // Per AWS docs, response elements come in this exact order. rclone's
  // strict XML parser cares.
  const parts: string[] = [
    `<Name>${esc(input.bucketName)}</Name>`,
    `<Prefix>${esc(maybeUrlEncode(params.prefix, enc))}</Prefix>`,
    `<KeyCount>${input.contents.length + input.commonPrefixes.length}</KeyCount>`,
    `<MaxKeys>${params.maxKeys}</MaxKeys>`,
  ];
  if (params.delimiter !== undefined) {
    parts.push(`<Delimiter>${esc(maybeUrlEncode(params.delimiter, enc))}</Delimiter>`);
  }
  parts.push(`<IsTruncated>${input.truncated ? "true" : "false"}</IsTruncated>`);
  if (params.continuationToken !== undefined) {
    parts.push(`<ContinuationToken>${esc(params.continuationToken)}</ContinuationToken>`);
  }
  if (input.nextContinuationToken) {
    parts.push(`<NextContinuationToken>${esc(input.nextContinuationToken)}</NextContinuationToken>`);
  }
  if (params.startAfter !== undefined) {
    parts.push(`<StartAfter>${esc(maybeUrlEncode(params.startAfter, enc))}</StartAfter>`);
  }
  if (params.encodingType) {
    parts.push(`<EncodingType>${params.encodingType}</EncodingType>`);
  }

  for (const row of input.contents) {
    const ownerXml = params.fetchOwner
      ? `<Owner><ID>${esc(input.ownerId)}</ID><DisplayName>${esc(input.ownerId)}</DisplayName></Owner>`
      : "";
    parts.push(
      "<Contents>" +
        `<Key>${esc(maybeUrlEncode(row.s3_key, enc))}</Key>` +
        // ISO 8601 with milliseconds — required format for the List XML
        // body. Don't confuse with the IMF-fixdate format used in the
        // GET response's Last-Modified header.
        `<LastModified>${row.uploaded_at.toISOString()}</LastModified>` +
        `<ETag>"${esc(row.etag)}"</ETag>` +
        `<Size>${row.size_bytes}</Size>` +
        `<StorageClass>STANDARD</StorageClass>` +
        ownerXml +
        "</Contents>",
    );
  }

  for (const cp of input.commonPrefixes) {
    parts.push(`<CommonPrefixes><Prefix>${esc(maybeUrlEncode(cp, enc))}</Prefix></CommonPrefixes>`);
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
    parts.join("") +
    `</ListBucketResult>`
  );
}

function maybeUrlEncode(s: string, enc: boolean): string {
  if (!enc) return s;
  // RFC 3986 percent-encoding. AWS encodes `/` too when encoding-type=
  // url is requested (the whole point — escape every reserved char so
  // control chars in keys don't break clients). encodeURIComponent
  // already encodes `/`; the additional !'()*~ need explicit handling.
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
