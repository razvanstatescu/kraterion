import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiKeysService } from "../api-keys/api-keys.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { asControlPlaneError, EnokiClientService } from "./enoki-client.service.js";

interface JwtClaims {
  sub: string;
  email?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
}

/**
 * Decode (do NOT verify) the OIDC ID token's payload. We rely on Enoki's
 * `getZkLogin` for verification — Enoki rejects bad signatures, expired
 * tokens, and wrong audiences before returning an address. We only need
 * the payload to extract the stable `sub` (and email for friendlier UX).
 */
function decodeJwtPayload(jwt: string): JwtClaims {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new ControlPlaneError("InvalidArgument", "Malformed JWT");
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    if (typeof payload !== "object" || payload === null) {
      throw new Error("payload not an object");
    }
    return payload as JwtClaims;
  } catch {
    throw new ControlPlaneError("InvalidArgument", "JWT payload is not valid JSON");
  }
}

export interface ResolvedZkLoginAccount {
  account: { id: string; email: string; sui_address: string; status: string; created_at: Date };
  project: { id: string; name: string };
  /** Set on first sign-up only — the cleartext API-key secret returned once. */
  bootstrap_api_key?: {
    id: string;
    access_key_id: string;
    secret: string;
  };
  /** True if this call created the account. */
  created: boolean;
}

/**
 * zkLogin account resolver.
 *
 * On every successful Google sign-in, we (a) hand the JWT to Enoki and
 * receive the canonical Sui address, (b) upsert the matching `Account`
 * row keyed by `zklogin_sub`, (c) on first sign-up, mint a default
 * project + API key so the user's boto3 / SDK clients work immediately.
 *
 * Trust model: Enoki performs the JWT signature + audience + expiry
 * verification (against Google's JWKS); the address it returns is
 * derived from `(google_sub, app_salt)` which Enoki manages. We only
 * decode the JWT payload to read the stable `sub` claim.
 */
@Injectable()
export class ZkLoginService {
  private readonly logger = new Logger(ZkLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enoki: EnokiClientService,
    private readonly projects: ProjectsService,
    private readonly apiKeys: ApiKeysService,
  ) {}

  /** Resolve a Google JWT to a Kraterion account, creating one on first sign-in. */
  async resolveOrCreate(jwt: string): Promise<ResolvedZkLoginAccount> {
    const claims = decodeJwtPayload(jwt);
    if (!claims.sub) {
      throw new ControlPlaneError("InvalidArgument", "JWT is missing the `sub` claim");
    }
    if (!claims.email) {
      throw new ControlPlaneError("InvalidArgument", "JWT is missing the `email` claim");
    }

    // Enoki verifies signature/audience/expiry and derives the address.
    const client = this.enoki.require();
    let address: string;
    try {
      const res = await client.getZkLogin({ jwt });
      address = res.address;
    } catch (err) {
      asControlPlaneError(err, "Enoki rejected the Google JWT");
    }

    // Look up existing account first — by `zklogin_sub`, the stable id.
    const existing = await this.prisma.account.findUnique({
      where: { zklogin_sub: claims.sub },
    });
    if (existing) {
      // Defensive: if the Enoki-derived address ever changes for an
      // existing zklogin_sub, refuse rather than silently mutate. (Enoki
      // never rotates the salt on a given app, so this should be
      // impossible — but worth catching loud if it happens.)
      if (existing.sui_address !== address) {
        this.logger.error(
          `zklogin_sub=${claims.sub} re-signed with a new address (was ${existing.sui_address}, got ${address})`,
        );
        throw new ControlPlaneError(
          "Conflict",
          "Account is registered with a different Sui address than Enoki returned",
        );
      }
      const project = await this.prisma.project.findFirst({
        where: { account_id: existing.id },
        orderBy: { created_at: "asc" },
      });
      return {
        account: pickAccount(existing),
        project: project ? { id: project.id, name: project.name } : { id: "", name: "" },
        created: false,
      };
    }

    // First-time sign-up: create account + first project + first API key
    // atomically. Mirrors the dev-sign-up endpoint's bootstrap flow.
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            email: claims.email!,
            zklogin_sub: claims.sub,
            sui_address: address,
            status: "active",
          },
        });
        const project = await this.projects.create(account.id, "default", tx);
        const minted = await this.apiKeys.mint(project.id, "default", tx);
        return { account, project, minted };
      });
      return {
        account: pickAccount(result.account),
        project: { id: result.project.id, name: result.project.name },
        bootstrap_api_key: {
          id: result.minted.apiKey.id,
          // `mint()` always populates `access_key_id` for kind="s3", so
          // the nullable column type is overly cautious here.
          access_key_id: result.minted.apiKey.access_key_id!,
          secret: result.minted.secret,
        },
        created: true,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = ((err.meta as { target?: string[] | string } | undefined)?.target ??
          []) as string[] | string;
        const field = Array.isArray(target) ? target[0] : String(target);
        throw new ControlPlaneError("Conflict", `Account ${field} already in use`, {
          field: field ?? "unknown",
        });
      }
      throw err;
    }
  }
}

function pickAccount<T extends { id: string; email: string; sui_address: string; status: string; created_at: Date }>(a: T) {
  return {
    id: a.id,
    email: a.email,
    sui_address: a.sui_address,
    status: a.status,
    created_at: a.created_at,
  };
}
