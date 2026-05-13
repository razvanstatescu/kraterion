/**
 * `Sigv4VerificationService` — the entry point for SigV4 verification.
 *
 *   - Parses the Authorization header (`./parser.ts`).
 *   - Pulls the request's `X-Amz-Date`, validates it's within ±5min skew.
 *   - Validates `X-Amz-Content-SHA256` is present and not the streaming
 *     chunked variant (rejected in v1).
 *   - Looks up the access key in Postgres → unwraps the secret via
 *     `KeyWrappingService`.
 *   - Builds the canonical request + string-to-sign + expected signature
 *     (`./canonical.ts`) and constant-time compares.
 *   - Returns the resolved `{ accountId, projectId, apiKeyId }` identity.
 *
 * Every reject path throws `S3Error` so the global filter renders the
 * canonical XML response.
 */

import { Injectable, Logger } from "@nestjs/common";
import { S3Error } from "../../s3/s3-error.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { KeyWrappingService } from "../key-wrapping.service.js";
import {
  buildCanonicalRequest,
  buildStringToSign,
  computeSignature,
  deriveSigningKey,
  signaturesEqual,
} from "./canonical.js";
import { parseAuthorizationHeader } from "./parser.js";
import { assertNotExpired, detectAndParseQuerySigv4, type ParsedQuerySigv4 } from "./query-mode.js";
import type {
  CanonicalRequestInputs,
  ParsedAuthorizationHeader,
  ResolvedIdentity,
} from "./types.js";

const SKEW_SECONDS = 5 * 60;

export interface VerifyInput {
  method: string;
  path: string;
  rawQuery: string;
  /** lowercased header name → value (single-value; multi-value uncommon for S3). */
  headers: Record<string, string>;
}

@Injectable()
export class Sigv4VerificationService {
  private readonly logger = new Logger(Sigv4VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyWrapper: KeyWrappingService,
  ) {}

  async verify(input: VerifyInput): Promise<ResolvedIdentity> {
    const auth = input.headers["authorization"];

    // Presigned URLs ("query-string SigV4") arrive with no Authorization
    // header — the sig components live in `?X-Amz-…` query params. If we
    // detect that mode, take the dedicated path. Otherwise require the
    // standard Authorization header.
    if (!auth) {
      const query = detectAndParseQuerySigv4(input.rawQuery);
      if (query) return this.verifyQueryMode(input, query);
      throw new S3Error("AccessDenied", "Missing Authorization header");
    }

    const parsed = parseAuthorizationHeader(auth);
    const amzDate = input.headers["x-amz-date"];
    if (!amzDate) throw new S3Error("InvalidRequest", "Missing X-Amz-Date header");
    this.validateAmzDateSkew(amzDate, parsed);

    const contentSha = input.headers["x-amz-content-sha256"];
    if (!contentSha) throw new S3Error("InvalidRequest", "Missing X-Amz-Content-SHA256 header");
    if (contentSha === "STREAMING-AWS4-HMAC-SHA256-PAYLOAD") {
      throw new S3Error(
        "NotImplemented",
        "Chunked SigV4 payloads are not supported. Use UNSIGNED-PAYLOAD or precomputed sha256.",
      );
    }

    const apiKey = await this.lookupApiKey(parsed.accessKeyId);

    const canonicalInputs: CanonicalRequestInputs = {
      method: input.method,
      path: input.path,
      rawQuery: input.rawQuery,
      headers: input.headers,
      contentSha256: contentSha,
    };

    const { canonical } = (() => {
      try {
        return buildCanonicalRequest(canonicalInputs, parsed.signedHeaders);
      } catch (err) {
        throw new S3Error("InvalidRequest", (err as Error).message);
      }
    })();

    const secretKey = this.unwrapSecret(apiKey.secret_wrapped);
    const stringToSign = buildStringToSign(amzDate, parsed, canonical);
    const signingKey = deriveSigningKey(
      secretKey,
      parsed.scopeDate,
      parsed.scopeRegion,
      parsed.scopeService,
    );
    const expected = computeSignature(signingKey, stringToSign);

    if (!signaturesEqual(expected, parsed.signature)) {
      this.logger.debug(
        `signature mismatch akid=${parsed.accessKeyId} expected=${expected.slice(0, 8)} got=${parsed.signature.slice(0, 8)}`,
      );
      throw new S3Error(
        "SignatureDoesNotMatch",
        "The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method.",
      );
    }

    return {
      accountId: apiKey.project.account_id,
      projectId: apiKey.project_id,
      apiKeyId: apiKey.id,
    };
  }

  /**
   * Query-string SigV4 ("presigned URL") verification.
   *
   * Differences from the header-mode path:
   *   - The payload hash is implicitly `UNSIGNED-PAYLOAD` (clients
   *     usually omit `X-Amz-Content-Sha256` from presigned URLs; we
   *     accept it if present but don't require it).
   *   - The canonical query string MUST exclude `X-Amz-Signature` —
   *     otherwise the gateway would sign its own output.
   *   - An explicit per-URL TTL (`X-Amz-Expires`) bounds validity on
   *     top of the ±5min `X-Amz-Date` skew tolerance.
   */
  private async verifyQueryMode(
    input: VerifyInput,
    parsed: ParsedQuerySigv4,
  ): Promise<ResolvedIdentity> {
    this.validateAmzDateSkew(parsed.amzDate, parsed);
    assertNotExpired(parsed);

    const apiKey = await this.lookupApiKey(parsed.accessKeyId);

    const contentSha = input.headers["x-amz-content-sha256"] ?? "UNSIGNED-PAYLOAD";
    if (contentSha === "STREAMING-AWS4-HMAC-SHA256-PAYLOAD") {
      throw new S3Error(
        "NotImplemented",
        "Chunked SigV4 payloads are not supported for presigned URLs.",
      );
    }

    const canonicalInputs: CanonicalRequestInputs = {
      method: input.method,
      path: input.path,
      rawQuery: input.rawQuery,
      headers: input.headers,
      contentSha256: contentSha,
    };

    const { canonical } = (() => {
      try {
        return buildCanonicalRequest(canonicalInputs, parsed.signedHeaders, "X-Amz-Signature");
      } catch (err) {
        throw new S3Error("InvalidRequest", (err as Error).message);
      }
    })();

    const secretKey = this.unwrapSecret(apiKey.secret_wrapped);
    const stringToSign = buildStringToSign(parsed.amzDate, parsed, canonical);
    const signingKey = deriveSigningKey(
      secretKey,
      parsed.scopeDate,
      parsed.scopeRegion,
      parsed.scopeService,
    );
    const expected = computeSignature(signingKey, stringToSign);
    if (!signaturesEqual(expected, parsed.signature)) {
      this.logger.debug(
        `presign sig mismatch akid=${parsed.accessKeyId} expected=${expected.slice(0, 8)} got=${parsed.signature.slice(0, 8)}`,
      );
      throw new S3Error(
        "SignatureDoesNotMatch",
        "The request signature we calculated does not match the signature you provided.",
      );
    }
    return {
      accountId: apiKey.project.account_id,
      projectId: apiKey.project_id,
      apiKeyId: apiKey.id,
    };
  }

  /**
   * Boto3's `X-Amz-Date` is ISO basic: `YYYYMMDDTHHMMSSZ`. We accept that
   * exact form and reject anything else.
   */
  private validateAmzDateSkew(amzDate: string, parsed: ParsedAuthorizationHeader): void {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
    if (!m) throw new S3Error("MalformedDate", "X-Amz-Date must be in ISO basic format YYYYMMDDTHHMMSSZ");
    const [, y, mo, d, h, mi, s] = m;
    const date = new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!));
    const skew = Math.abs((date.getTime() - Date.now()) / 1000);
    if (skew > SKEW_SECONDS) {
      throw new S3Error(
        "RequestTimeTooSkewed",
        `The difference between the request time and the current time is too large (skew ${Math.round(skew)}s, max ${SKEW_SECONDS}s).`,
      );
    }
    // Cross-check: the date inside Authorization Credential must match
    // x-amz-date's date portion.
    const yyyymmdd = `${y}${mo}${d}`;
    if (parsed.scopeDate !== yyyymmdd) {
      throw new S3Error(
        "InvalidRequest",
        `Authorization Credential date (${parsed.scopeDate}) does not match X-Amz-Date (${yyyymmdd}).`,
      );
    }
  }

  private async lookupApiKey(accessKeyId: string) {
    const row = await this.prisma.apiKey.findUnique({
      where: { access_key_id: accessKeyId },
      include: { project: true },
    });
    // `kind="bearer"` rows live in the same table but have no signing
    // material. They should never reach SigV4 (no AKIA in `Credential=`)
    // but we guard anyway: refuse cross-protocol use as InvalidAccessKeyId.
    if (
      !row ||
      row.revoked_at !== null ||
      row.kind !== "s3" ||
      !row.secret_wrapped
    ) {
      throw new S3Error("InvalidAccessKeyId", "The AWS Access Key Id you provided does not exist in our records.");
    }
    return row as typeof row & { secret_wrapped: Buffer };
  }

  private unwrapSecret(wrapped: Buffer | Uint8Array): string {
    try {
      return this.keyWrapper.unwrap(wrapped).toString("utf8");
    } catch (err) {
      this.logger.error(`Failed to unwrap secret: ${(err as Error).message}`);
      throw new S3Error("InternalError", "Internal error while resolving credentials.");
    }
  }
}
