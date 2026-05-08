/**
 * Parser for the `Authorization: AWS4-HMAC-SHA256 ...` header.
 *
 * Format:
 *   AWS4-HMAC-SHA256 Credential={akid}/{date}/{region}/{service}/aws4_request, SignedHeaders={list}, Signature={hex}
 *
 * Boto3 always emits exactly this form. We tolerate optional whitespace
 * around `,` and `=` (matches MinIO's tolerance) but nothing more —
 * boto3 doesn't use comma-vs-semicolon variations in `SignedHeaders`,
 * so non-conforming inputs are real attacks/bugs and we reject them.
 */

import { S3Error } from "../../s3/s3-error.js";
import type { ParsedAuthorizationHeader } from "./types.js";

const AUTH_PREFIX = "AWS4-HMAC-SHA256";

export function parseAuthorizationHeader(headerValue: string): ParsedAuthorizationHeader {
  if (!headerValue.startsWith(AUTH_PREFIX + " ")) {
    throw new S3Error("InvalidRequest", "Authorization header must start with AWS4-HMAC-SHA256");
  }
  const params = headerValue.slice(AUTH_PREFIX.length + 1).split(",");
  let credential: string | undefined;
  let signedHeaders: string | undefined;
  let signature: string | undefined;
  for (const raw of params) {
    const eq = raw.indexOf("=");
    if (eq === -1) continue;
    const key = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim();
    if (key === "Credential") credential = value;
    else if (key === "SignedHeaders") signedHeaders = value;
    else if (key === "Signature") signature = value;
  }
  if (!credential || !signedHeaders || !signature) {
    throw new S3Error(
      "InvalidRequest",
      "Authorization header missing Credential, SignedHeaders, or Signature",
    );
  }

  // Credential = {akid}/{date}/{region}/{service}/aws4_request
  // The access key may contain `/` in theory, but standard AKIA-style
  // keys don't. Split from the right to be tolerant.
  const credParts = credential.split("/");
  if (credParts.length !== 5) {
    throw new S3Error("InvalidRequest", "Authorization Credential must have 5 slash-separated parts");
  }
  const [accessKeyId, scopeDate, scopeRegion, scopeService, terminator] = credParts as [
    string,
    string,
    string,
    string,
    string,
  ];
  if (terminator !== "aws4_request") {
    throw new S3Error("InvalidRequest", "Authorization Credential terminator must be aws4_request");
  }
  if (scopeService !== "s3") {
    throw new S3Error("InvalidRequest", `Authorization Credential service must be s3 (got ${scopeService})`);
  }
  if (!/^\d{8}$/.test(scopeDate)) {
    throw new S3Error("InvalidRequest", "Authorization Credential date must be YYYYMMDD");
  }

  const headers = signedHeaders.split(";").map((h) => h.toLowerCase());
  if (headers.length === 0 || !headers.includes("host")) {
    throw new S3Error("InvalidRequest", "SignedHeaders must include host");
  }
  const sorted = [...headers].sort();
  if (headers.join(";") !== sorted.join(";")) {
    throw new S3Error("InvalidRequest", "SignedHeaders must be sorted alphabetically");
  }

  if (!/^[0-9a-f]{64}$/.test(signature)) {
    throw new S3Error("InvalidRequest", "Signature must be 64-char lowercase hex");
  }

  return {
    algorithm: "AWS4-HMAC-SHA256",
    accessKeyId,
    scopeDate,
    scopeRegion,
    scopeService,
    signedHeaders: headers,
    signature,
  };
}
