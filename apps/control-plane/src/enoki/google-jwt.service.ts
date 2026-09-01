import { Injectable, Logger } from "@nestjs/common";
import { createPublicKey, type JsonWebKey, verify as cryptoVerify } from "node:crypto";
import { ControlPlaneError } from "../errors/control-plane-error.js";

/**
 * Local Google OIDC ID-token verifier (replaces Enoki's JWT verification).
 *
 * Enoki verified the Google JWT for us as part of `getZkLogin`. Self-hosting
 * zkLogin means we must do it ourselves: fetch Google's JWKS, check the RS256
 * signature, and validate `iss` / `aud` / `exp`. Uses only `node:crypto` and
 * `fetch` — no extra dependency (no `jose`).
 *
 * The accepted `aud` is our own OAuth client id (`GOOGLE_CLIENT_ID`), so a
 * token minted for a different app is rejected.
 */

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);
/** Refresh JWKS at most this often; Google rotates keys slowly. */
const JWKS_TTL_MS = 60 * 60 * 1000;

interface Jwk {
  kid: string;
  n: string;
  e: string;
  kty: string;
  alg?: string;
  use?: string;
}

export interface GoogleClaims {
  sub: string;
  email: string;
  aud: string;
  iss: string;
  exp: number;
  email_verified?: boolean;
  name?: string;
}

function b64urlToJson(part: string): Record<string, unknown> {
  try {
    const json = Buffer.from(part, "base64url").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    // Malformed base64/JSON → a bad token, not a server fault.
    throw new ControlPlaneError("Unauthorized", "Malformed JWT segment", {
      reason: "malformed",
    });
  }
}

@Injectable()
export class GoogleJwtService {
  private readonly logger = new Logger(GoogleJwtService.name);
  private jwksCache: { keys: Map<string, Jwk>; fetchedAt: number } | null = null;

  private clientId(): string {
    const id = process.env["GOOGLE_CLIENT_ID"] ?? process.env["NEXT_PUBLIC_GOOGLE_CLIENT_ID"];
    if (!id) {
      throw new ControlPlaneError(
        "InternalError",
        "GOOGLE_CLIENT_ID is not configured; cannot verify Google ID tokens.",
      );
    }
    return id;
  }

  private async jwks(): Promise<Map<string, Jwk>> {
    const now = Date.now();
    if (this.jwksCache && now - this.jwksCache.fetchedAt < JWKS_TTL_MS) {
      return this.jwksCache.keys;
    }
    const res = await fetch(GOOGLE_JWKS_URL);
    if (!res.ok) {
      // Serve stale keys rather than fail an in-flight login on a transient blip.
      if (this.jwksCache) return this.jwksCache.keys;
      throw new ControlPlaneError("InternalError", `Failed to fetch Google JWKS: ${res.status}`);
    }
    const body = (await res.json()) as { keys: Jwk[] };
    const keys = new Map<string, Jwk>();
    for (const k of body.keys) keys.set(k.kid, k);
    this.jwksCache = { keys, fetchedAt: now };
    return keys;
  }

  /**
   * Verify a Google ID token and return its claims. Throws
   * `ControlPlaneError("Unauthorized")` on any failure.
   */
  async verify(jwt: string): Promise<GoogleClaims> {
    const parts = jwt.split(".");
    if (parts.length !== 3) {
      throw new ControlPlaneError("Unauthorized", "Malformed JWT", { reason: "malformed" });
    }
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    const header = b64urlToJson(headerB64);
    if (header["alg"] !== "RS256") {
      throw new ControlPlaneError("Unauthorized", "Unsupported JWT alg (expected RS256)", {
        reason: "alg",
      });
    }
    const kid = header["kid"];
    if (typeof kid !== "string") {
      throw new ControlPlaneError("Unauthorized", "JWT header missing kid", { reason: "kid" });
    }

    let keys = await this.jwks();
    let jwk = keys.get(kid);
    if (!jwk) {
      // Unknown kid → force a refresh once (Google rotated).
      this.jwksCache = null;
      keys = await this.jwks();
      jwk = keys.get(kid);
    }
    if (!jwk) {
      throw new ControlPlaneError("Unauthorized", "No matching Google signing key", {
        reason: "no-jwk",
      });
    }

    const keyObject = createPublicKey({
      key: jwk as unknown as JsonWebKey,
      format: "jwk",
    });
    const signingInput = Buffer.from(`${headerB64}.${payloadB64}`);
    const signature = Buffer.from(signatureB64, "base64url");
    const valid = cryptoVerify("RSA-SHA256", signingInput, keyObject, signature);
    if (!valid) {
      throw new ControlPlaneError("Unauthorized", "JWT signature verification failed", {
        reason: "signature",
      });
    }

    const payload = b64urlToJson(payloadB64);
    const iss = String(payload["iss"] ?? "");
    const aud = String(payload["aud"] ?? "");
    const sub = String(payload["sub"] ?? "");
    const exp = Number(payload["exp"] ?? 0);
    const email = typeof payload["email"] === "string" ? payload["email"] : "";

    if (!GOOGLE_ISSUERS.has(iss)) {
      throw new ControlPlaneError("Unauthorized", "Unexpected token issuer", { reason: "iss", iss });
    }
    if (aud !== this.clientId()) {
      throw new ControlPlaneError("Unauthorized", "Token audience is not this app", {
        reason: "aud",
      });
    }
    if (!sub) {
      throw new ControlPlaneError("Unauthorized", "JWT missing sub", { reason: "sub" });
    }
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      throw new ControlPlaneError("Unauthorized", "Token expired", { reason: "expired" });
    }

    return {
      sub,
      email,
      aud,
      iss,
      exp,
      email_verified: payload["email_verified"] === true,
      ...(typeof payload["name"] === "string" ? { name: payload["name"] } : {}),
    };
  }
}
