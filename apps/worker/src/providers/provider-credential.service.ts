import { Injectable } from "@nestjs/common";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Worker-side mirror of the control plane's `ProviderCredentialService`.
 *
 * Worker callsites only ever read the stored key — never list, never
 * write — so the surface is a single `useDecrypted` accessor. The CP
 * is the authoritative writer; we share `KEY_WRAPPING_MASTER_KEY` via
 * env, so the same wrapped blob unwraps in both processes.
 *
 * If the row is missing or not 'active', the function throws
 * `MissingProviderCredentialError`. The embeddings processor catches it
 * and finalizes the manifest with `error_detail='openai_credential_missing'`
 * — the indexer keeps draining other buckets.
 */
export class MissingProviderCredentialError extends Error {
  constructor(
    public readonly provider: string,
    public readonly reason: "missing" | "invalid" | "revoked",
  ) {
    super(`${provider} credential ${reason} for project`);
    this.name = "MissingProviderCredentialError";
  }
}

@Injectable()
export class ProviderCredentialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wrapping: KeyWrappingService,
  ) {}

  async useDecrypted<T>(
    projectId: string,
    provider: "openai",
    fn: (apiKey: string) => Promise<T>,
  ): Promise<T> {
    const row = await this.prisma.providerCredential.findUnique({
      where: { project_id_provider: { project_id: projectId, provider } },
    });
    if (!row) {
      throw new MissingProviderCredentialError(provider, "missing");
    }
    if (row.status !== "active") {
      throw new MissingProviderCredentialError(
        provider,
        row.status as "invalid" | "revoked",
      );
    }
    const plain = this.wrapping.unwrap(row.encrypted_key).toString("utf8");
    return fn(plain);
  }
}
