import { Injectable } from "@nestjs/common";
import type { ApiKey, Prisma } from "@prisma/client";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { newAkia, newSecret } from "./akia.js";

export interface MintedApiKey {
  apiKey: ApiKey;
  /** Cleartext secret — returned to caller exactly once at mint time. */
  secret: string;
}

/** Public-facing shape: secret_wrapped stripped, never serialized. */
export type RedactedApiKey = Omit<ApiKey, "secret_wrapped">;

function redact(row: ApiKey): RedactedApiKey {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { secret_wrapped, ...rest } = row;
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
        access_key_id: akia,
        secret_wrapped: wrapped,
      },
    });
    return { apiKey, secret };
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
