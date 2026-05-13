import { Injectable } from "@nestjs/common";
import type { ApiKey, Prisma } from "@prisma/client";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { newAkia, newSecret } from "./akia.js";
import { mintBearerToken, networkFromEnv } from "./bearer.js";

export interface MintedApiKey {
  apiKey: ApiKey;
  /** Cleartext secret — returned to caller exactly once at mint time. */
  secret: string;
}

export interface MintedBearer {
  apiKey: ApiKey;
  /** Cleartext token (`kr_live_…` / `kr_test_…`); returned once at mint time. */
  token: string;
}

/**
 * Public-facing shape: `secret_wrapped` and `token_hash` are both stripped.
 * The hash isn't directly exploitable (you'd need a preimage to use it as
 * a token) but there is no reason to ship it to the wire.
 */
export type RedactedApiKey = Omit<ApiKey, "secret_wrapped" | "token_hash">;

function redact(row: ApiKey): RedactedApiKey {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secret_wrapped, token_hash, ...rest } = row;
  return rest;
}

/**
 * Authoritative writer for `ApiKey`. Owns the AKIA generation, secret
 * wrapping, and ownership checks. The gateway treats `ApiKey` as
 * read-only — keys minted here are immediately usable for SigV4 against
 * the gateway because both apps share the same `KEY_WRAPPING_MASTER_KEY`.
 */
@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wrapping: KeyWrappingService,
  ) {}

  /**
   * Mint a new key under the given project. Caller MUST verify the project
   * belongs to the requesting account before calling — this method does
   * not re-check (the auth-controller dev sign-up creates the project
   * itself and skips the check).
   */
  async mint(
    projectId: string,
    name: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<MintedApiKey> {
    const akia = newAkia();
    const secret = newSecret();
    const wrapped = this.wrapping.wrap(Buffer.from(secret, "utf8"));
    const apiKey = await tx.apiKey.create({
      data: {
        project_id: projectId,
        name,
        kind: "s3",
        access_key_id: akia,
        secret_wrapped: wrapped,
      },
    });
    return { apiKey, secret };
  }

  /**
   * Mint a unified bearer token (`kr_live_…` / `kr_test_…`). The prefix
   * reflects `SUI_NETWORK` at mint time; the bearer guard later refuses
   * cross-network use the same way Stripe refuses `sk_test_` in live mode.
   */
  async mintBearer(
    projectId: string,
    name: string,
    scopes: string[] = [],
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<MintedBearer> {
    const network = networkFromEnv();
    const { token, hash, display } = mintBearerToken(network);
    const apiKey = await tx.apiKey.create({
      data: {
        project_id: projectId,
        name,
        kind: "bearer",
        token_hash: hash,
        token_prefix: display,
        network,
        scopes,
      },
    });
    return { apiKey, token };
  }

  async createBearerForProject(
    accountId: string,
    projectId: string,
    name: string,
    scopes: string[] = [],
  ): Promise<MintedBearer> {
    await this.assertProjectOwned(accountId, projectId);
    return this.mintBearer(projectId, name, scopes);
  }

  /**
   * List API keys under a project, with secret_wrapped redacted. Asserts
   * the project belongs to `accountId`; returns 404 if not (don't leak
   * existence of foreign projects).
   */
  async listForProject(accountId: string, projectId: string): Promise<RedactedApiKey[]> {
    await this.assertProjectOwned(accountId, projectId);
    const rows = await this.prisma.apiKey.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: "asc" },
    });
    return rows.map(redact);
  }

  /**
   * Mint via the public surface — verifies the project belongs to the
   * caller, then delegates to `mint`. Returns the cleartext secret once.
   */
  async createForProject(
    accountId: string,
    projectId: string,
    name: string,
  ): Promise<MintedApiKey> {
    await this.assertProjectOwned(accountId, projectId);
    return this.mint(projectId, name);
  }

  async revoke(accountId: string, apiKeyId: string): Promise<RedactedApiKey> {
    const existing = await this.prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      include: { project: true },
    });
    if (!existing || existing.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "API key not found");
    }
    if (existing.revoked_at) {
      // Idempotent: revoking a revoked key is fine, just return current state.
      return redact(existing);
    }
    const updated = await this.prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { revoked_at: new Date() },
    });
    return redact(updated);
  }

  private async assertProjectOwned(accountId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { account_id: true },
    });
    if (!project || project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Project not found");
    }
  }
}
