import { Injectable } from "@nestjs/common";
import { KRATERION_PACKAGE_ID, kraterion } from "@kraterion/kraterion-move-sdk";
import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { BucketsService } from "../buckets.service.js";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ProjectsService } from "../../projects/projects.service.js";
import { SponsorshipService } from "../../enoki/sponsorship.service.js";
import { GatewayAddressService } from "../../sui/gateway-address.service.js";
import { KnowledgeIndexerAddressService } from "../../sui/knowledge-indexer-address.service.js";
import { SuiClientService } from "../../sui/sui-client.service.js";
import { type EncryptionMode, encodeMode } from "./dto.js";
import type { PrepareTxResponse } from "./wire.js";

const FN = {
  createGrantAndShare: "kraterion::create_grant_and_share_bucket",
  createAndShare: "kraterion::create_and_share_bucket",
  grantApi: "kraterion::grant_api_access",
  revokeAll: "kraterion::revoke_all_api_access",
  setVisibility: "kraterion::set_bucket_visibility",
} as const;

/**
 * Builds the unsigned PTBs for the four bucket-lifecycle calls and hands
 * them to our self-hosted `SponsorshipService` for gas sponsorship.
 *
 * For each entry function we:
 *   1. Verify ownership against Postgres (`accountId` → project / bucket).
 *   2. Build a `Transaction` with the single Move call.
 *   3. Serialize via `tx.build({ client, onlyTransactionKind: true })` — the
 *      sponsor path adds the gas envelope (operator as gas owner) itself.
 *   4. Call `SponsorshipService.createSponsored` with the user's address and
 *      a per-request `allowedMoveCallTargets` set to the *exact* package-
 *      qualified target — a defense-in-depth guard on the reconstructed PTB.
 *
 * The Move helpers in `@kraterion/kraterion-move-sdk` default
 * `package: '@local-pkg/kraterion'` (a NamedPackagesPlugin placeholder).
 * We pin to `KRATERION_PACKAGE_ID` explicitly so the prepare path
 * doesn't depend on the plugin being registered on the calling
 * Transaction.
 */
@Injectable()
export class PrepareTxService {
  constructor(
    private readonly buckets: BucketsService,
    private readonly projects: ProjectsService,
    private readonly gateway: GatewayAddressService,
    private readonly knowledgeIndexer: KnowledgeIndexerAddressService,
    private readonly prisma: PrismaService,
    private readonly sui: SuiClientService,
    private readonly sponsorship: SponsorshipService,
  ) {}

  // === create + (optional) grant ===

  async prepareCreate(
    accountId: string,
    senderAddress: string,
    args: {
      projectId: string;
      name: string;
      encryptionMode: EncryptionMode;
      grantApiAccess: boolean;
      apiAddrOverride?: string | undefined;
    },
  ): Promise<PrepareTxResponse> {
    await this.projects.getOwned(accountId, args.projectId);

    const tx = new Transaction();
    const nameBytes = Array.from(Buffer.from(args.name, "utf8"));
    const mode = encodeMode(args.encryptionMode);

    let target: string;
    let summary: string;
    if (args.grantApiAccess) {
      const apiAddr = args.apiAddrOverride ?? (await this.gateway.get());
      tx.add(
        kraterion.createGrantAndShareBucket({
          package: KRATERION_PACKAGE_ID,
          arguments: { name: nameBytes, apiAddr, encryptionMode: mode },
        }),
      );
      target = qualified(FN.createGrantAndShare);
      summary = `Create bucket "${args.name}" (${args.encryptionMode}) with API access granted to ${shorten(apiAddr)}`;
    } else {
      tx.add(
        kraterion.createAndShareBucket({
          package: KRATERION_PACKAGE_ID,
          arguments: { name: nameBytes, encryptionMode: mode },
        }),
      );
      target = qualified(FN.createAndShare);
      summary = `Create bucket "${args.name}" (${args.encryptionMode}); API access NOT granted`;
    }

    return this.sponsor(tx, senderAddress, target, summary);
  }

  // === grant API to existing bucket ===

  /**
   * Grant API access on a bucket.
   *
   * Two modes:
   *   - **Specific address (override).** Caller passes an explicit
   *     `apiAddrOverride` — only that address is granted. Used by the
   *     Knowledge-enable flow (grants the indexer) and any future
   *     fine-grained tooling.
   *   - **Default (no override).** Re-grants the gateway. If the bucket
   *     has Knowledge enabled, also re-grants the indexer in the SAME
   *     PTB so post-revoke restoration brings the indexer back too —
   *     otherwise a `revoke_all` + restore cycle leaves Knowledge
   *     half-broken (chunks searchable, new uploads fail to archive).
   *
   * `grant_api_access` is idempotent on chain (no-op if already
   * present), so the duplicate grant on already-authorized buckets
   * costs nothing.
   */
  async prepareGrantApi(
    accountId: string,
    senderAddress: string,
    bucketId: string,
    args: { apiAddrOverride?: string | undefined },
  ): Promise<PrepareTxResponse> {
    const bucket = await this.buckets.getOwned(accountId, bucketId);
    const tx = new Transaction();
    const bucketArg = mutableShared(tx, bucket.kraterion_bucket_object_id);

    if (args.apiAddrOverride) {
      tx.add(
        kraterion.grantApiAccess({
          package: KRATERION_PACKAGE_ID,
          arguments: { bucket: bucketArg, apiAddr: args.apiAddrOverride },
        }),
      );
      const summary = `Grant API access on "${bucket.name}" to ${shorten(args.apiAddrOverride)}`;
      return this.sponsor(tx, senderAddress, qualified(FN.grantApi), summary);
    }

    // Default path: gateway grant + (conditional) indexer grant.
    const gatewayAddr = await this.gateway.get();
    tx.add(
      kraterion.grantApiAccess({
        package: KRATERION_PACKAGE_ID,
        arguments: { bucket: bucketArg, apiAddr: gatewayAddr },
      }),
    );

    const knowledgeEnabled = await this.prisma.knowledgeBucketSettings.findUnique({
      where: { bucket_id: bucket.id },
      select: { bucket_id: true },
    });
    let summary: string;
    if (knowledgeEnabled) {
      const indexerAddr = await this.knowledgeIndexer.get();
      tx.add(
        kraterion.grantApiAccess({
          package: KRATERION_PACKAGE_ID,
          arguments: { bucket: bucketArg, apiAddr: indexerAddr },
        }),
      );
      summary =
        `Restore API access on "${bucket.name}" (gateway ${shorten(gatewayAddr)} + ` +
        `Knowledge indexer ${shorten(indexerAddr)})`;
    } else {
      summary = `Grant API access on "${bucket.name}" to ${shorten(gatewayAddr)}`;
    }

    return this.sponsor(tx, senderAddress, qualified(FN.grantApi), summary);
  }

  // === per-agent grant / revoke ===

  /**
   * Sponsored `grant_api_access(bucket, agent.sub_wallet_address)`.
   *
   * The dashboard fires this once per attached bucket so the agent's
   * Sui sub-wallet shows up in the bucket's on-chain
   * `api_decryption_addresses` list. Idempotent — granting an
   * already-granted address is a no-op on chain.
   *
   * Ownership: the agent must belong to the same account as the
   * bucket; we look up the agent here and refuse foreign ids.
   */
  async prepareGrantAgent(
    accountId: string,
    senderAddress: string,
    bucketId: string,
    args: { agentId: string },
  ): Promise<PrepareTxResponse> {
    const bucket = await this.buckets.getOwned(accountId, bucketId);
    const agent = await this.fetchOwnedAgent(accountId, args.agentId);
    if (agent.project_id !== bucket.project_id) {
      throw new ControlPlaneError(
        "InvalidArgument",
        "Agent and bucket belong to different projects.",
        { agent_id: args.agentId, bucket_id: bucketId },
      );
    }
    if (agent.status !== "active") {
      throw new ControlPlaneError(
        "PreconditionFailed",
        "Cannot grant a revoked agent. Create a new agent or restore this one first.",
        { agent_id: args.agentId, status: agent.status },
      );
    }
    const tx = new Transaction();
    const bucketArg = mutableShared(tx, bucket.kraterion_bucket_object_id);
    tx.add(
      kraterion.grantApiAccess({
        package: KRATERION_PACKAGE_ID,
        arguments: { bucket: bucketArg, apiAddr: agent.sub_wallet.sui_address },
      }),
    );
    const summary =
      `Grant agent "${agent.name}" (${shorten(agent.sub_wallet.sui_address)}) ` +
      `on-chain access to "${bucket.name}"`;
    return this.sponsor(tx, senderAddress, qualified(FN.grantApi), summary);
  }

  /**
   * Sponsored per-agent revoke. Move package only exposes
   * `revoke_all_api_access`; we emulate per-address revoke by
   * reading the current `api_decryption_addresses` list from chain,
   * filtering out the agent's address, and emitting
   * `revoke_all_api_access` + a `grant_api_access` per surviving
   * principal in one PTB. Net effect: only the agent is removed.
   *
   * Why read the list from chain instead of computing from DB:
   * the DB doesn't shadow the on-chain ACL — there's no indexer
   * handler for `KraterionApiAccessGranted`/`Revoked` events. The
   * chain is the source of truth; we re-read it here so we never
   * "drop" a principal we didn't know about.
   */
  async prepareRevokeAgent(
    accountId: string,
    senderAddress: string,
    bucketId: string,
    args: { agentId: string },
  ): Promise<PrepareTxResponse> {
    const bucket = await this.buckets.getOwned(accountId, bucketId);
    const agent = await this.fetchOwnedAgent(accountId, args.agentId);
    if (agent.project_id !== bucket.project_id) {
      throw new ControlPlaneError(
        "InvalidArgument",
        "Agent and bucket belong to different projects.",
        { agent_id: args.agentId, bucket_id: bucketId },
      );
    }

    const currentAddresses = await this.readApiDecryptionAddresses(
      bucket.kraterion_bucket_object_id,
    );
    const targetAddr = agent.sub_wallet.sui_address.toLowerCase();
    const survivors = currentAddresses.filter(
      (a) => a.toLowerCase() !== targetAddr,
    );

    const tx = new Transaction();
    const bucketArg = mutableShared(tx, bucket.kraterion_bucket_object_id);
    tx.add(
      kraterion.revokeAllApiAccess({
        package: KRATERION_PACKAGE_ID,
        arguments: { bucket: bucketArg },
      }),
    );
    for (const addr of survivors) {
      tx.add(
        kraterion.grantApiAccess({
          package: KRATERION_PACKAGE_ID,
          arguments: { bucket: bucketArg, apiAddr: addr },
        }),
      );
    }
    const summary =
      `Revoke agent "${agent.name}" (${shorten(agent.sub_wallet.sui_address)}) ` +
      `from "${bucket.name}"; keeps ${survivors.length} other principal` +
      `${survivors.length === 1 ? "" : "s"}`;
    return this.sponsor(
      tx,
      senderAddress,
      [qualified(FN.revokeAll), qualified(FN.grantApi)],
      summary,
    );
  }

  /**
   * Look up an agent + its sub-wallet, verifying it belongs to the
   * caller's account. Used by the per-agent prepare endpoints; the
   * AgentsService has its own getter but we'd induce a circular
   * module dependency by importing it here, so we go through Prisma
   * directly (same shape AgentsService.fetchOwned uses).
   */
  private async fetchOwnedAgent(accountId: string, agentId: string) {
    const row = await this.prisma.kraterionAgent.findUnique({
      where: { id: agentId },
      include: {
        sub_wallet: { select: { sui_address: true } },
        project: { select: { account_id: true } },
      },
    });
    if (!row || row.project.account_id !== accountId) {
      throw new ControlPlaneError("NotFound", "Agent not found");
    }
    return row;
  }

  /**
   * Read the live `api_decryption_addresses` vector off the
   * KraterionBucket object. Returns lower-cased hex strings.
   *
   * Defensive: any RPC / parsing failure falls back to an empty
   * list, which makes the revoke PTB effectively a `revoke_all` —
   * acceptable because the user has explicit intent to revoke this
   * agent. We log so a flaky RPC at revoke time leaves a trail.
   */
  private async readApiDecryptionAddresses(
    bucketObjectId: string,
  ): Promise<string[]> {
    try {
      const { object } = await this.sui.get().core.getObject({
        objectId: bucketObjectId,
        include: { json: true },
      });
      const fields = object.json;
      const list = fields?.["api_decryption_addresses"];
      if (!Array.isArray(list)) return [];
      return list
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.toLowerCase());
    } catch {
      return [];
    }
  }

  // === revoke just the knowledge_indexer ===

  /**
   * Remove the Knowledge indexer from the bucket's
   * `api_decryption_addresses` list without affecting the gateway.
   *
   * The Move package only exposes `revoke_all_api_access` (clears the
   * whole vector) and `grant_api_access` (adds one address). A
   * dedicated per-address revoke would need a Move bump + republish,
   * which would orphan every existing bucket. So we emulate it: the
   * PTB runs `revoke_all_api_access` and then `grant_api_access` for
   * the gateway in the same transaction. Net effect: only the indexer
   * is removed, atomically.
   *
   * The dashboard calls this when Knowledge is disabled on a bucket so
   * the indexer's on-chain authority doesn't outlive the user's
   * intent.
   *
   * Idempotent on chain — re-running when the indexer isn't on the
   * list is a no-op cycle (revoke clears nothing relevant, grant adds
   * back the gateway which was already there). Cheap.
   */
  async prepareRevokeIndexer(
    accountId: string,
    senderAddress: string,
    bucketId: string,
  ): Promise<PrepareTxResponse> {
    const bucket = await this.buckets.getOwned(accountId, bucketId);
    const gatewayAddr = await this.gateway.get();
    const tx = new Transaction();
    const bucketArg = mutableShared(tx, bucket.kraterion_bucket_object_id);
    tx.add(
      kraterion.revokeAllApiAccess({
        package: KRATERION_PACKAGE_ID,
        arguments: { bucket: bucketArg },
      }),
    );
    tx.add(
      kraterion.grantApiAccess({
        package: KRATERION_PACKAGE_ID,
        arguments: { bucket: bucketArg, apiAddr: gatewayAddr },
      }),
    );
    const summary =
      `Remove Knowledge indexer from "${bucket.name}" (keeps gateway ${shorten(gatewayAddr)})`;
    return this.sponsor(
      tx,
      senderAddress,
      [qualified(FN.revokeAll), qualified(FN.grantApi)],
      summary,
    );
  }

  // === revoke all API access ===

  async prepareRevokeAll(
    accountId: string,
    senderAddress: string,
    bucketId: string,
  ): Promise<PrepareTxResponse> {
    const bucket = await this.buckets.getOwned(accountId, bucketId);
    const tx = new Transaction();
    tx.add(
      kraterion.revokeAllApiAccess({
        package: KRATERION_PACKAGE_ID,
        arguments: { bucket: mutableShared(tx, bucket.kraterion_bucket_object_id) },
      }),
    );
    const summary = `Revoke ALL API access on "${bucket.name}". The gateway will no longer be able to read or write into this bucket.`;
    return this.sponsor(tx, senderAddress, qualified(FN.revokeAll), summary);
  }

  // === flip visibility ===

  async prepareVisibility(
    accountId: string,
    senderAddress: string,
    bucketId: string,
    args: { encryptionMode: EncryptionMode },
  ): Promise<PrepareTxResponse> {
    const bucket = await this.buckets.getOwned(accountId, bucketId);
    if (bucket.encryption_mode === args.encryptionMode) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Bucket is already in ${args.encryptionMode} mode`,
        { current: bucket.encryption_mode, requested: args.encryptionMode },
      );
    }
    const mode = encodeMode(args.encryptionMode);
    const tx = new Transaction();
    tx.add(
      kraterion.setBucketVisibility({
        package: KRATERION_PACKAGE_ID,
        arguments: {
          bucket: mutableShared(tx, bucket.kraterion_bucket_object_id),
          encryptionMode: mode,
        },
      }),
    );
    const summary = `Change visibility of "${bucket.name}" from ${bucket.encryption_mode} to ${args.encryptionMode}`;
    return this.sponsor(tx, senderAddress, qualified(FN.setVisibility), summary);
  }

  /**
   * Common tail: produce the kind-bytes, call Enoki for sponsorship,
   * shape the wire response.
   */
  private async sponsor(
    tx: Transaction,
    senderAddress: string,
    moveCallTarget: string | string[],
    summary: string,
  ): Promise<PrepareTxResponse> {
    const kindBytes = await tx.build({
      client: this.sui.get(),
      onlyTransactionKind: true,
    });
    const transactionKindBytes = Buffer.from(kindBytes).toString("base64");
    // PTBs that bundle two distinct entry functions (e.g. revoke_all +
    // grant_api_access for the "remove indexer, keep gateway" flow)
    // need both targets allow-listed. A single string still works for
    // the common one-function-per-PTB case.
    const targets = Array.isArray(moveCallTarget) ? moveCallTarget : [moveCallTarget];
    const sponsored = await this.sponsorship.createSponsored({
      transactionKindBytes,
      sender: senderAddress,
      allowedMoveCallTargets: targets,
    });
    return {
      digest: sponsored.digest,
      bytes: sponsored.bytes,
      expected: {
        package_id: KRATERION_PACKAGE_ID,
        function: targets[0]!,
        summary,
        sender: senderAddress,
        allowed_move_call_targets: targets,
        sponsored_by: "kraterion",
      },
    };
  }
}

/**
 * Tag the bucket as a mutably-borrowed shared object input. Without the
 * `mutable: true` flag the SDK has to call `getMoveFunction` to discover
 * the parameter's mutability — extra RPCs, more failure modes, and
 * harder to stub in tests. Setting it explicitly keeps the resolver on
 * its happy path: it only needs `getObjects` to fill in the version.
 */
function mutableShared(tx: Transaction, objectId: string): TransactionObjectArgument {
  return tx.object({
    $kind: "UnresolvedObject",
    UnresolvedObject: { objectId, mutable: true },
  });
}

function qualified(unqualifiedTarget: string): string {
  // unqualifiedTarget looks like "kraterion::create_and_share_bucket".
  // Enoki expects the fully-qualified `<package>::<module>::<fn>` form.
  return `${KRATERION_PACKAGE_ID}::${unqualifiedTarget}`;
}

function shorten(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
