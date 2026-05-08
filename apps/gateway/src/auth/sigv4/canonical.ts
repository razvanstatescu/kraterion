/**
 * Canonical request + string-to-sign builders for SigV4-S3.
 *
 * Pure functions, no I/O — easy to unit-test against fixtures captured
 * from boto3. The `aws4` npm package's `canonicalString` is a useful
 * cross-check oracle in tests.
 *
 * S3-specific encoding rules (different from the generic SigV4):
 *   - Path is encoded ONCE, not double-encoded.
 *   - `/` in the path is preserved.
 *   - Header values: trim outer whitespace, collapse internal runs of
 *     whitespace to a single space.
 *
 * References:
 *   - https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 *   - https://github.com/minio/minio/blob/master/cmd/signature-v4.go
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { CanonicalRequestInputs, ParsedAuthorizationHeader } from "./types.js";

const UNRESERVED = new Set<string>();
{
  const range = (a: string, z: string) => {
    const out: string[] = [];
    for (let c = a.charCodeAt(0); c <= z.charCodeAt(0); c++) out.push(String.fromCharCode(c));
    return out;
  };
  for (const c of [...range("A", "Z"), ...range("a", "z"), ...range("0", "9"), "-", "_", ".", "~"]) {
    UNRESERVED.add(c);
  }
}

/**
 * RFC3986 percent-encode for SigV4. `keepSlash=true` preserves `/`,
 * which S3's canonical URI rule requires.
 */
export function awsUriEncode(input: string, keepSlash: boolean): string {
  let out = "";
  for (const ch of input) {
    if (UNRESERVED.has(ch)) out += ch;
    else if (ch === "/" && keepSlash) out += "/";
    else {
      const bytes = Buffer.from(ch, "utf8");
      for (const b of bytes) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
    }
  }
  return out;
}

/** Canonical URI: encode the request path once, preserving `/`. Empty -> "/". */
export function canonicalUri(path: string): string {
  if (!path || path === "") return "/";
  return awsUriEncode(decodeURIComponent(path), true);
}

/**
 * Canonical query string: split, encode each key/value, sort by encoded
 * key (ties broken by encoded value), join with `&`. Empty input -> "".
 *
 * Multi-value keys are kept as separate `key=value` entries; both their
 * encoded keys and values participate in the sort.
 */
export function canonicalQueryString(rawQuery: string): string {
  if (!rawQuery) return "";
  const pairs: [string, string][] = [];
  for (const part of rawQuery.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? "" : part.slice(eq + 1);
    pairs.push([
      awsUriEncode(decodeURIComponent(k), false),
      awsUriEncode(decodeURIComponent(v), false),
    ]);
  }
  pairs.sort(([k1, v1], [k2, v2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : v1 < v2 ? -1 : v1 > v2 ? 1 : 0));
  return pairs.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Header value normalization: trim outer whitespace, collapse internal
 * runs of whitespace to a single space (only outside double-quoted
 * segments — but boto3 never sends quoted header values in practice,
 * so we do the simple form).
 */
function normalizeHeaderValue(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

/**
 * Build the canonical-headers + signed-headers fragments.
 * `signedHeaders` is the list from the Authorization header
 * (lowercased, sorted). Every entry MUST be present in `headers`.
 */
export function canonicalHeaders(
  headers: Record<string, string>,
  signedHeaders: string[],
): { canonical: string; missing: string[] } {
  const lower: Record<string, string> = {};
  for (const k of Object.keys(headers)) {
    const v = headers[k];
    if (v === undefined) continue;
    lower[k.toLowerCase()] = normalizeHeaderValue(v);
  }
  const missing: string[] = [];
  const lines: string[] = [];
  for (const name of signedHeaders) {
    const v = lower[name];
    if (v === undefined) {
      missing.push(name);
      continue;
    }
    lines.push(`${name}:${v}\n`);
  }
  return { canonical: lines.join(""), missing };
}

/** sha256(input) → lowercase hex */
function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Build the canonical request string (5 \n-separated parts + payload hash). */
export function buildCanonicalRequest(
  inputs: CanonicalRequestInputs,
  signedHeaders: string[],
): { canonical: string; signedHeadersJoined: string } {
  const { canonical: headersStr, missing } = canonicalHeaders(inputs.headers, signedHeaders);
  if (missing.length > 0) {
    throw new Error(`SignedHeaders not present in request: ${missing.join(", ")}`);
  }
  const signedHeadersJoined = signedHeaders.join(";");
  const canonical =
    inputs.method.toUpperCase() +
    "\n" +
    canonicalUri(inputs.path) +
    "\n" +
    canonicalQueryString(inputs.rawQuery) +
    "\n" +
    headersStr +
    "\n" +
    signedHeadersJoined +
    "\n" +
    inputs.contentSha256;
  return { canonical, signedHeadersJoined };
}

/** "AWS4-HMAC-SHA256\n{amzDate}\n{scope}\n{sha256(canonical)}" */
export function buildStringToSign(
  amzDate: string,
  parsed: ParsedAuthorizationHeader,
  canonicalRequest: string,
): string {
  const scope = `${parsed.scopeDate}/${parsed.scopeRegion}/${parsed.scopeService}/aws4_request`;
  return `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256Hex(canonicalRequest)}`;
}

/** Standard SigV4 signing-key derivation. */
export function deriveSigningKey(
  secretKey: string,
  scopeDate: string,
  region: string,
  service: string,
): Buffer {
  const kDate = createHmac("sha256", "AWS4" + secretKey).update(scopeDate).digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update(service).digest();
  return createHmac("sha256", kService).update("aws4_request").digest();
}

export function computeSignature(signingKey: Buffer, stringToSign: string): string {
  return createHmac("sha256", signingKey).update(stringToSign).digest("hex");
}

/** Constant-time hex compare. Returns false on length mismatch. */
export function signaturesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
