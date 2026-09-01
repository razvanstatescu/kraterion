import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { jwtToAddress } from "@mysten/sui/zklogin";
import { ApiKeysService } from "../api-keys/api-keys.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { InvitesService } from "../invites/invites.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { GoogleJwtService } from "./google-jwt.service.js";
import { ZkLoginSaltService } from "./salt.service.js";

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
 * zkLogin account resolver (self-hosted; no Enoki).
 *
 * On every successful Google sign-in, we (a) verify the Google ID token
 * locally (JWKS/RS256/aud/exp), (b) derive the canonical Sui address from
 * `(iss, aud, sub) + our deterministic salt` via `@mysten/sui/zklogin`'s
 * `jwtToAddress`, (c) upsert the matching `Account` row keyed by
 * `zklogin_sub`, (d) on first sign-up, mint a default project + API key so
 * the user's boto3 / SDK clients work immediately.
 *
 * Trust model: we perform the JWT signature + audience + expiry verification
 * ourselves (`GoogleJwtService`); the address is derived from the same salt
 * (`ZkLoginSaltService`) the dashboard uses to build the zkLogin signature,
 * so the address the user signs with matches the one we store.
 */
@Injectable()
export class ZkLoginService {
  private readonly logger = new Logger(ZkLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleJwt: GoogleJwtService,
    private readonly salt: ZkLoginSaltService,
    private readonly projects: ProjectsService,
    private readonly apiKeys: ApiKeysService,
    private readonly invites: InvitesService,
  ) {}

  /**
   * Resolve a Google JWT to a Kraterion account, creating one on first sign-in.
   *
   * `inviteCode` is required only when creating a new account and the invite
   * gate is enabled; returning users (existing `zklogin_sub`) ignore it. The
   * code is claimed atomically inside the account-creation transaction, so a
   * failed claim rolls the whole sign-up back.
   */
  async resolveOrCreate(jwt: string, inviteCode?: string): Promise<ResolvedZkLoginAccount> {
    // Verify the Google ID token locally (signature/issuer/audience/expiry).
    const claims = await this.googleJwt.verify(jwt);
    if (!claims.email) {
      throw new ControlPlaneError("InvalidArgument", "JWT is missing the `email` claim");
    }

    // Derive the zkLogin address from the same salt the dashboard uses.
    const userSalt = this.salt.deriveSalt(claims.iss, claims.aud, claims.sub);
    // `legacyAddress=false` → the current (non-legacy) address scheme.
    const address = jwtToAddress(jwt, userSalt, false);

    // Look up existing account first — by `zklogin_sub`, the stable id.
    const existing = await this.prisma.account.findUnique({
      where: { zklogin_sub: claims.sub },
    });
    if (existing) {
      // Defensive: the derived address must be stable for a given
      // zklogin_sub (our salt is deterministic), so a mismatch means the
      // salt seed changed — refuse rather than silently mutate the address.
      if (existing.sui_address !== address) {
        this.logger.error(
          `zklogin_sub=${claims.sub} re-signed with a new address (was ${existing.sui_address}, got ${address})`,
        );
        throw new ControlPlaneError(
          "Conflict",
          "Account is registered with a different Sui address than the one derived now (has ZKLOGIN_SALT_SEED changed?)",
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

    // Invite gate: creating a new account requires a valid code (when the gate
    // is enabled). Pre-validate here for a clean, early error; the authoritative
    // claim happens atomically inside the transaction below.
    const gateOn = this.invites.isEnabled();
    if (gateOn) {
      if (!inviteCode) {
        throw new ControlPlaneError(
          "Forbidden",
          "An invite code is required to create a Kraterion account.",
          { reason: "invite_required" },
        );
      }
      const check = await this.invites.validate(inviteCode);
      if (!check.valid) {
        throw new ControlPlaneError(
          "InvalidArgument",
          check.message ?? "That invite code isn't valid.",
          { reason: check.reason ?? "invite_invalid" },
        );
      }
    }

    // First-time sign-up: create account + first project + first API key
    // atomically. Mirrors the dev-sign-up endpoint's bootstrap flow. When the
    // gate is on, the code is claimed in the same transaction — if the claim
    // fails (e.g. the last slot was taken concurrently after pre-validation),
    // the account creation rolls back too.
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
        if (gateOn) {
          await this.invites.claimWithinTx(tx, inviteCode!, account.id);
        }
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
