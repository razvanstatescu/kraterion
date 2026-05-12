import { Injectable, Logger } from "@nestjs/common";
import type { ProviderCredential } from "@prisma/client";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ProviderName, RedactedCredential } from "./dto.js";

type CredentialStatus = "active" | "invalid" | "revoked";

function redact(row: ProviderCredential): RedactedCredential {
  return {
    provider: row.provider as ProviderName,
    key_last_4: row.key_last_4,
    status: row.status as CredentialStatus,
    last_validated: row.last_validated,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Authoritative writer + accessor for `ProviderCredential`. Replaces the
 * process-wide `OPENAI_API_KEY` env var: every callsite that needs an
 * OpenAI key (worker indexing, CP search/ask, MCP `kraterion_ask`)
 * funnels through `useDecrypted`, which unwraps in-memory for the
 * duration of a single closure and never assigns the plaintext to a
 * longer-lived binding.
 *
 * Ownership is the caller's responsibility for the management surface
 * (`list` / `upsert` / `remove`) — the controllers call
 * `ProjectsService.getOwned` first. `useDecrypted` is internal-only and
 * trusts its `projectId` is already authorized.
 */
@Injectable()
export class ProviderCredentialService {
  private readonly logger = new Logger(ProviderCredentialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wrapping: KeyWrappingService,
  ) {}

  async list(projectId: string): Promise<RedactedCredential[]> {
    const rows = await this.prisma.providerCredential.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: "asc" },
    });
    return rows.map(redact);
  }

  /**
   * Validate then persist. Validation ping happens *before* the write so
   * an invalid key never reaches the DB with status='active'. If the
   * ping is transient (network blip, 5xx), we preserve the current
   * status (or default to 'active') rather than poisoning the row.
   */
  async upsert(
    projectId: string,
    provider: ProviderName,
    plainKey: string,
  ): Promise<RedactedCredential> {
    const trimmed = plainKey.trim();
    if (trimmed.length < 20) {
      throw new ControlPlaneError("InvalidArgument", "API key looks too short to be valid.");
    }

    const verdict = await this.validateKey(provider, trimmed);
    if (verdict === "invalid") {
      throw new ControlPlaneError(
        "InvalidArgument",
        "Provider rejected this key. Check it on the provider's dashboard and try again.",
        { provider },
      );
    }

    const wrapped = this.wrapping.wrap(Buffer.from(trimmed, "utf8"));
    const last4 = trimmed.slice(-4);
    const now = new Date();

    const row = await this.prisma.providerCredential.upsert({
      where: { project_id_provider: { project_id: projectId, provider } },
      create: {
        project_id: projectId,
        provider,
        encrypted_key: wrapped,
        key_last_4: last4,
        status: "active",
        last_validated: verdict === "active" ? now : null,
      },
      update: {
        encrypted_key: wrapped,
        key_last_4: last4,
        status: "active",
        last_validated: verdict === "active" ? now : null,
      },
    });
    return redact(row);
  }

  /**
   * Count buckets in the project that currently have Knowledge enabled.
   * Used by `remove` to decide whether deletion needs cascade
   * confirmation (because removing the key would otherwise leave
   * those Knowledge bases in a perpetually-failing state — search
   * and indexing would 409 on every call until a new key is added).
   */
  async countActiveKnowledgeBuckets(projectId: string): Promise<number> {
    return this.prisma.knowledgeBucketSettings.count({
      where: { bucket: { project_id: projectId } },
    });
  }

  /**
   * Hard-delete the credential. When `cascade` is false (default) and
   * the project has any Knowledge-enabled buckets, the caller gets a
   * `PreconditionFailed` with `details.buckets_with_knowledge = N` so
   * the dashboard can prompt for type-to-confirm before retrying with
   * `cascade=true`. Cascade mode deletes every `KnowledgeChunk` and
   * `KnowledgeBucketSettings` row in the project in the same
   * transaction as the credential — disabling Knowledge everywhere in
   * the project atomically.
   *
   * `KnowledgeManifest` rows survive on purpose: they're audit/verifiability
   * artifacts. They become orphaned (no settings, no chunks), which is
   * the same state the existing `POST /knowledge { enabled: false }`
   * disable flow produces.
   */
  async remove(
    projectId: string,
    provider: ProviderName,
    opts: { cascade?: boolean } = {},
  ): Promise<{ credential: RedactedCredential | null; disabled_buckets: number }> {
    const existing = await this.prisma.providerCredential.findUnique({
      where: { project_id_provider: { project_id: projectId, provider } },
    });
    if (!existing) return { credential: null, disabled_buckets: 0 };

    const activeBuckets = await this.countActiveKnowledgeBuckets(projectId);

    if (activeBuckets > 0 && !opts.cascade) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "Removing this key will disable Knowledge on every bucket in the project. Confirm to continue.",
        {
          provider,
          reason: "active_knowledge_bases",
          buckets_with_knowledge: String(activeBuckets),
        },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (activeBuckets > 0) {
        // KnowledgeChunk has no `bucket` relation field (only the raw
        // bucket_id column), so we resolve project buckets first and
        // delete by id list. Cheaper than a subquery for the few-buckets
        // case typical at this scale.
        const bucketIds = (
          await tx.bucket.findMany({
            where: { project_id: projectId },
            select: { id: true },
          })
        ).map((b) => b.id);
        if (bucketIds.length > 0) {
          // Chunks first (manifests stay for audit), then settings.
          await tx.knowledgeChunk.deleteMany({
            where: { bucket_id: { in: bucketIds } },
          });
          await tx.knowledgeBucketSettings.deleteMany({
            where: { bucket_id: { in: bucketIds } },
          });
        }
      }
      await tx.providerCredential.delete({
        where: { project_id_provider: { project_id: projectId, provider } },
      });
    });

    return { credential: redact(existing), disabled_buckets: activeBuckets };
  }

  /**
   * Run `fn` with the decrypted plaintext key. Plaintext never escapes
   * this closure. Throws `PreconditionFailed` (409 on the wire) if the
   * row is missing or not active — callers may catch and translate to
   * domain-specific copy.
   */
  async useDecrypted<T>(
    projectId: string,
    provider: ProviderName,
    fn: (apiKey: string) => Promise<T>,
  ): Promise<T> {
    const row = await this.prisma.providerCredential.findUnique({
      where: { project_id_provider: { project_id: projectId, provider } },
    });
    if (!row) {
      throw new ControlPlaneError(
        "PreconditionFailed",
        `${provider} credential is not configured for this project. Configure it on /keys.`,
        { provider, reason: "missing" },
      );
    }
    if (row.status !== "active") {
      throw new ControlPlaneError(
        "PreconditionFailed",
        `${provider} credential is marked ${row.status}. Replace it on /keys.`,
        { provider, reason: row.status },
      );
    }
    const plain = this.wrapping.unwrap(row.encrypted_key).toString("utf8");
    return fn(plain);
  }

  /**
   * Cheapest authoritative check OpenAI exposes: `GET /v1/models`. 200
   * means the key authenticates, 401 means it doesn't. Anything else
   * (5xx, network error, timeout) returns 'active' so a flaky network
   * doesn't poison the stored row — the next `useDecrypted` will surface
   * the real problem.
   */
  private async validateKey(
    provider: ProviderName,
    plainKey: string,
  ): Promise<CredentialStatus> {
    if (provider !== "openai") {
      throw new ControlPlaneError("InvalidArgument", `Unsupported provider: ${provider}`);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5_000);
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { authorization: `Bearer ${plainKey}` },
        signal: ctrl.signal,
      });
      if (res.status === 200) return "active";
      if (res.status === 401) return "invalid";
      this.logger.warn(`OpenAI validation returned ${res.status}; treating as transient`);
      return "active";
    } catch (err) {
      this.logger.warn(`OpenAI validation ping failed: ${(err as Error).message}`);
      return "active";
    } finally {
      clearTimeout(timer);
    }
  }
}
