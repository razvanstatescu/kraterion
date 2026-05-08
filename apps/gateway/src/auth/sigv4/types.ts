/**
 * Types for parsed SigV4 inputs and resolved identity. The verifier
 * never throws raw `Error`s — every reject case maps to an `S3Error`
 * code (see `s3-error.ts`).
 */

export interface ParsedAuthorizationHeader {
  algorithm: "AWS4-HMAC-SHA256";
  accessKeyId: string;
  /** YYYYMMDD from the credential scope. */
  scopeDate: string;
  scopeRegion: string;
  scopeService: string; // must be "s3"
  signedHeaders: string[]; // lowercase, sorted
  signature: string; // hex, lowercase
}

export interface CanonicalRequestInputs {
  method: string;
  path: string;
  /** Raw query string from the URL, without the leading "?". */
  rawQuery: string;
  /**
   * Lowercased header name → original-cased header value, as the client
   * sent it. The verifier picks out the headers listed in
   * `signedHeaders` only.
   */
  headers: Record<string, string>;
  /**
   * The `x-amz-content-sha256` header verbatim — `UNSIGNED-PAYLOAD`,
   * a hex string, or `STREAMING-AWS4-HMAC-SHA256-PAYLOAD` (which we
   * reject in v1).
   */
  contentSha256: string;
}

export interface ResolvedIdentity {
  accountId: string;
  projectId: string;
  apiKeyId: string;
}

/**
 * Attached to the Fastify request after successful SigV4 verification.
 * Downstream controllers read this instead of headers.
 */
export interface KraterionRequestContext {
  identity: ResolvedIdentity;
  /** Raw bucket name extracted by the URL-style middleware. */
  bucket?: string;
  /** Decoded object key (after path-style or virtual-hosted parsing). */
  key?: string;
}
