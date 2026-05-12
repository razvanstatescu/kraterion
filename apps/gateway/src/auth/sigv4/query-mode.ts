/**
 * Query-string SigV4 parser — the "presigned URL" form.
 *
 * Format on the wire (AWS docs):
 *
 *   https://host/path?X-Amz-Algorithm=AWS4-HMAC-SHA256
 *                     &X-Amz-Credential={akid}/{date}/{region}/{service}/aws4_request
 *                     &X-Amz-Date={ISO8601 basic}
 *                     &X-Amz-Expires={seconds}
 *                     &X-Amz-SignedHeaders={lc;sorted;list}
 *                     &X-Amz-Signature={hex}
 *
 * What's different from header-mode (`parser.ts`):
 *   - The `Authorization` header is absent.
 *   - `X-Amz-Content-Sha256` may also be absent — payload hash is
 *     implicitly `UNSIGNED-PAYLOAD` per AWS spec when omitted.
 *   - The canonical request excludes `X-Amz-Signature` from its own
 *     query string but includes the rest of the `X-Amz-*` params.
 *   - `X-Amz-Expires` bounds the URL's validity window — it's an
 *     explicit, per-URL TTL on top of the ±5 min `X-Amz-Date` skew.
 *
 * Pure parser — throws `S3Error` on every malformed shape so the
 * upstream verifier can short-circuit before any DB lookup.
 */

import { S3Error } from "../../s3/s3-error.js";
import type { ParsedAuthorizationHeader } from "./types.js";

const ALG = "AWS4-HMAC-SHA256";
// Tighten the expiry cap to S3's documented 7-day maximum (604800s)
// even though our CP signs much shorter (300s). Anything longer almost
// certainly indicates a misconfiguration.
const MAX_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

export interface ParsedQuerySigv4 extends ParsedAuthorizationHeader {
  /** Seconds between `X-Amz-Date` and URL expiry. */
  expiresInSeconds: number;
  /** Raw `X-Amz-Date` value — feeds the existing skew check unchanged. */
  amzDate: string;
}

/**
 * Returns `null` when the rawQuery doesn't look like a presigned URL
 * (no `X-Amz-Algorithm`). Throws when the URL is malformed.
 */
export function detectAndParseQuerySigv4(rawQuery: string): ParsedQuerySigv4 | null {
  if (!rawQuery) return null;
  const params = new URLSearchParams(rawQuery);
  if (!params.has("X-Amz-Algorithm")) return null;

  if (params.get("X-Amz-Algorithm") !== ALG) {
    throw new S3Error("InvalidRequest", `Unsupported X-Amz-Algorithm`);
  }

  const credential = required(params, "X-Amz-Credential");
  const amzDate = required(params, "X-Amz-Date");
  const signedHeadersRaw = required(params, "X-Amz-SignedHeaders");
  const signature = required(params, "X-Amz-Signature");
  const expiresRaw = required(params, "X-Amz-Expires");

  // Credential = {akid}/{date}/{region}/s3/aws4_request — same layout
  // header-mode uses, parsed the same way.
  const credParts = credential.split("/");
  if (credParts.length !== 5) {
    throw new S3Error("InvalidRequest", "X-Amz-Credential must have 5 slash-separated parts");
  }
  const [accessKeyId, scopeDate, scopeRegion, scopeService, terminator] = credParts as [
    string, string, string, string, string,
  ];
  if (terminator !== "aws4_request") {
    throw new S3Error("InvalidRequest", "X-Amz-Credential terminator must be aws4_request");
  }
  if (scopeService !== "s3") {
    throw new S3Error("InvalidRequest", `X-Amz-Credential service must be s3 (got ${scopeService})`);
  }
  if (!/^\d{8}$/.test(scopeDate)) {
    throw new S3Error("InvalidRequest", "X-Amz-Credential date must be YYYYMMDD");
  }

  const headers = signedHeadersRaw.split(";").map((h) => h.toLowerCase());
  if (headers.length === 0 || !headers.includes("host")) {
    throw new S3Error("InvalidRequest", "X-Amz-SignedHeaders must include host");
  }
  const sorted = [...headers].sort();
  if (headers.join(";") !== sorted.join(";")) {
    throw new S3Error("InvalidRequest", "X-Amz-SignedHeaders must be sorted alphabetically");
  }

  if (!/^[0-9a-f]{64}$/.test(signature)) {
    throw new S3Error("InvalidRequest", "X-Amz-Signature must be 64-char lowercase hex");
  }

  const expiresInSeconds = Number(expiresRaw);
  if (
    !Number.isFinite(expiresInSeconds) ||
    !Number.isInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > MAX_EXPIRES_SECONDS
  ) {
    throw new S3Error("InvalidRequest", `X-Amz-Expires must be between 1 and ${MAX_EXPIRES_SECONDS}`);
  }

  return {
    algorithm: ALG,
    accessKeyId,
    scopeDate,
    scopeRegion,
    scopeService,
    signedHeaders: headers,
    signature,
    amzDate,
    expiresInSeconds,
  };
}

function required(params: URLSearchParams, key: string): string {
  const v = params.get(key);
  if (!v) throw new S3Error("InvalidRequest", `Missing query parameter: ${key}`);
  return v;
}

/**
 * RFC-7232-ish expiry check: `X-Amz-Date + X-Amz-Expires` must still be
 * in the future. The amzDate format mirrors header-mode (`YYYYMMDDTHHMMSSZ`).
 */
export function assertNotExpired(parsed: ParsedQuerySigv4): void {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(parsed.amzDate);
  if (!m) {
    throw new S3Error("InvalidRequest", "X-Amz-Date must be ISO basic format YYYYMMDDTHHMMSSZ");
  }
  const [, y, mo, d, h, mi, s] = m;
  const signedAt = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!);
  const expiresAt = signedAt + parsed.expiresInSeconds * 1000;
  if (Date.now() > expiresAt) {
    throw new S3Error(
      "RequestExpired",
      "The provided pre-signed URL has expired. Generate a new one.",
    );
  }
}
