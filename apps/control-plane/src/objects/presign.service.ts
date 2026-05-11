import { Injectable } from "@nestjs/common";
import aws4 from "aws4";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { BucketsService } from "../buckets/buckets.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Signed-request envelope the dashboard uses for direct gateway I/O.
 *
 * The gateway already accepts `X-Amz-Content-Sha256: UNSIGNED-PAYLOAD`
 * in its SigV4 verifier (`apps/gateway/src/auth/sigv4/sigv4.service.ts:64-72`),
 * so the CP can sign the request without seeing the body — the dashboard
 * just sends the bytes against the URL with the returned headers attached.
 *
 * `expires_at` is informational: the signature is bound by SigV4's
 * `X-Amz-Date` ± 5-min skew the gateway enforces.
 */
export interface SignedRequest {
  method: "PUT" | "GET" | "DELETE";
  url: string;
  headers: Record<string, string>;
  expires_at: string;
}

const REGION = "eu-central-1";

@Injectable()
export class PresignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buckets: BucketsService,
    private readonly wrapping: KeyWrappingService,
  ) {}

  // === Sign URL builders ====================================================

  async signUpload(args: {
    accountId: string;
    bucketId: string;
    key: string;
    contentType?: string | undefined;
  }): Promise<SignedRequest> {
    const bucket = await this.buckets.getOwned(args.accountId, args.bucketId);
    this.assertApiAccess(bucket.api_access_granted, bucket.name);
    const creds = await this.requireProjectCredentials(bucket.project_id);
    return this.sign({
      method: "PUT",
      bucketName: bucket.name,
      key: args.key,
      contentType: args.contentType ?? "application/octet-stream",
      creds,
    });
  }

  async signDownload(args: {
    accountId: string;
    objectId: string;
  }): Promise<SignedRequest> {
    const object = await this.buckets.getObject(args.accountId, args.objectId);
    const bucket = await this.buckets.getOwned(args.accountId, object.bucket_id);
    this.assertApiAccess(bucket.api_access_granted, bucket.name);
    const creds = await this.requireProjectCredentials(bucket.project_id);
    return this.sign({
      method: "GET",
      bucketName: bucket.name,
      key: object.s3_key,
      creds,
    });
  }

  async signDelete(args: {
    accountId: string;
    objectId: string;
  }): Promise<SignedRequest> {
    const object = await this.buckets.getObject(args.accountId, args.objectId);
    const bucket = await this.buckets.getOwned(args.accountId, object.bucket_id);
    this.assertApiAccess(bucket.api_access_granted, bucket.name);
    const creds = await this.requireProjectCredentials(bucket.project_id);
    return this.sign({
      method: "DELETE",
      bucketName: bucket.name,
      key: object.s3_key,
      creds,
    });
  }

  // === Internals ============================================================

  /**
   * Look up the project's most recent non-revoked API key and unwrap its
   * secret. Errors translate to 409 so the dashboard can prompt the user
   * to mint a key on `/keys`. (Backend bootstrap mints one at sign-up
   * time, but a user could revoke all keys without realizing the dashboard
   * depends on having one.)
   */
  private async requireProjectCredentials(projectId: string): Promise<{
    akia: string;
    secret: string;
  }> {
    const key = await this.prisma.apiKey.findFirst({
      where: { project_id: projectId, revoked_at: null },
      orderBy: { created_at: "desc" },
    });
    if (!key) {
      throw new ControlPlaneError(
        "Conflict",
        "No usable API key for this project. Mint one on /keys first.",
        { project_id: projectId },
      );
    }
    const secret = this.wrapping.unwrap(key.secret_wrapped).toString("utf8");
    return { akia: key.access_key_id, secret };
  }

  private assertApiAccess(granted: boolean, bucketName: string): void {
    if (!granted) {
      throw new ControlPlaneError(
        "Forbidden",
        `API access is revoked for bucket "${bucketName}". Restore it on the bucket Settings page.`,
        { code: "KeyAccessRevoked" },
      );
    }
  }

  /**
   * Build the signed envelope. Uses `aws4.sign` with our gateway as the
   * host, region `eu-central-1`, service `s3`. The gateway's SigV4
   * verifier accepts any region (it just has to match the credential
   * scope) — we pin one for consistency.
   *
   * `X-Amz-Content-Sha256: UNSIGNED-PAYLOAD` lets the dashboard send
   * the body without us pre-hashing it; the gateway accepts that
   * payload mode (see `sigv4.service.ts`).
   */
  private sign(args: {
    method: "PUT" | "GET" | "DELETE";
    bucketName: string;
    key: string;
    contentType?: string;
    creds: { akia: string; secret: string };
  }): SignedRequest {
    const gatewayUrl = process.env["GATEWAY_URL"] ?? "http://localhost:4002";
    const parsed = new URL(gatewayUrl);
    const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    const hostHeader = parsed.port ? `${parsed.hostname}:${port}` : parsed.hostname;
    const path = `/${encodeURIComponent(args.bucketName)}/${args.key
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/")}`;

    const requestHeaders: Record<string, string> = {
      "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    };
    if (args.method === "PUT" && args.contentType) {
      requestHeaders["Content-Type"] = args.contentType;
    }

    const signed = aws4.sign(
      {
        host: hostHeader,
        path,
        method: args.method,
        service: "s3",
        region: REGION,
        headers: requestHeaders,
        signQuery: false,
        // `body` left undefined — UNSIGNED-PAYLOAD means aws4 doesn't
        // need to see the bytes to compute the signature.
      },
      {
        accessKeyId: args.creds.akia,
        secretAccessKey: args.creds.secret,
      },
    );

    // Filter to the headers the gateway actually needs the browser to
    // resend. aws4 injects `Host`, `X-Amz-Date`, `Authorization`,
    // `X-Amz-Content-Sha256`, and (for PUT) `Content-Type`.
    const outHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(signed.headers ?? {})) {
      if (typeof value === "string") outHeaders[name] = value;
    }
    // `Host` is implied by `fetch`'s URL — browsers refuse to set it
    // explicitly, and our gateway derives it from the request line.
    delete outHeaders["Host"];

    // 5 minutes is enough headroom for the dashboard to PUT a file,
    // and well within SigV4's ±5-min `X-Amz-Date` skew tolerance.
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    return {
      method: args.method,
      url: `${parsed.protocol}//${parsed.host}${path}`,
      headers: outHeaders,
      expires_at: expires,
    };
  }
}
