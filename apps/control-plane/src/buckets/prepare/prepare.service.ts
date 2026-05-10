import { Injectable } from "@nestjs/common";
import { KRATERION_PACKAGE_ID, kraterion } from "@kraterion/kraterion-move-sdk";
import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import { BucketsService } from "../buckets.service.js";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { ProjectsService } from "../../projects/projects.service.js";
import { SponsorshipService } from "../../enoki/sponsorship.service.js";
import { GatewayAddressService } from "../../sui/gateway-address.service.js";
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
 * Builds the unsigned PTBs for the four bucket-lifecycle calls and
 * hands them to Enoki for sponsorship.
 *
 * For each entry function we:
 *   1. Verify ownership against Postgres (`accountId` → project / bucket).
 *   2. Build a `Transaction` with the single Move call, the same way
 *      Phase 3 did.
 *   3. Serialize via `tx.build({ client, onlyTransactionKind: true })` —
 *      Enoki accepts kind-bytes only (it constructs gas + sender itself).
 *   4. Call `SponsorshipService.createSponsored` with the user's address
 *      and a per-request `allowedMoveCallTargets` set to the *exact*
 *      package-qualified target. Enoki will refuse to settle anything
 *      else, so a malicious frontend can't redirect our budget.
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

  async prepareGrantApi(
    accountId: string,
    senderAddress: string,
    bucketId: string,
    args: { apiAddrOverride?: string | undefined },
  ): Promise<PrepareTxResponse> {
    const bucket = await this.buckets.getOwned(accountId, bucketId);
    const apiAddr = args.apiAddrOverride ?? (await this.gateway.get());
    const tx = new Transaction();
    tx.add(
      kraterion.grantApiAccess({
        package: KRATERION_PACKAGE_ID,
        arguments: { bucket: mutableShared(tx, bucket.kraterion_bucket_object_id), apiAddr },
      }),
    );
    const summary = `Grant API access on "${bucket.name}" to ${shorten(apiAddr)}`;
    return this.sponsor(tx, senderAddress, qualified(FN.grantApi), summary);
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
    moveCallTarget: string,
    summary: string,
  ): Promise<PrepareTxResponse> {
    const kindBytes = await tx.build({
      client: this.sui.get(),
      onlyTransactionKind: true,
    });
    const transactionKindBytes = Buffer.from(kindBytes).toString("base64");
    const sponsored = await this.sponsorship.createSponsored({
      transactionKindBytes,
      sender: senderAddress,
      allowedMoveCallTargets: [moveCallTarget],
    });
    return {
      digest: sponsored.digest,
      bytes: sponsored.bytes,
      expected: {
        package_id: KRATERION_PACKAGE_ID,
        function: moveCallTarget,
        summary,
        sender: senderAddress,
        allowed_move_call_targets: [moveCallTarget],
        sponsored_by: "enoki",
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
