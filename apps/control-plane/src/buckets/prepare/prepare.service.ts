import { Injectable } from "@nestjs/common";
import { KRATERION_PACKAGE_ID, kraterion } from "@kraterion/kraterion-move-sdk";
import { Transaction } from "@mysten/sui/transactions";
import { BucketsService } from "../buckets.service.js";
import { ControlPlaneError } from "../../errors/control-plane-error.js";
import { ProjectsService } from "../../projects/projects.service.js";
import { GatewayAddressService } from "../../sui/gateway-address.service.js";
import { type EncryptionMode, encodeMode } from "./dto.js";
import type { PrepareTxResponse } from "./wire.js";

interface BuildContext {
  /** The signing user's address — embedded in `expected.sender_hint`. */
  senderHint: string;
}

/**
 * Builds the unsigned PTBs for the four bucket-lifecycle calls. None
 * of them touch Postgres beyond the ownership / project lookups; the
 * actual `Bucket` row arrives via the indexer once the user signs and
 * the on-chain event fires.
 *
 * The Move helpers in `@kraterion/kraterion-move-sdk` default
 * `package: '@local-pkg/kraterion'` (a NamedPackagesPlugin placeholder).
 * We pin it to `KRATERION_PACKAGE_ID` explicitly so we don't need the
 * plugin in this code path.
 */
@Injectable()
export class PrepareTxService {
  constructor(
    private readonly buckets: BucketsService,
    private readonly projects: ProjectsService,
    private readonly gateway: GatewayAddressService,
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
    // Ownership: the project must belong to the caller. (Bucket name
    // uniqueness is enforced on-chain — there is no DB-level check at
    // the prepare step because the row will be inserted by the indexer
    // after the user signs.)
    await this.projects.getOwned(accountId, args.projectId);

    const tx = new Transaction();
    const nameBytes = Array.from(Buffer.from(args.name, "utf8"));
    const mode = encodeMode(args.encryptionMode);

    let fn: string;
    let summary: string;
    if (args.grantApiAccess) {
      const apiAddr = args.apiAddrOverride ?? (await this.gateway.get());
      tx.add(
        kraterion.createGrantAndShareBucket({
          package: KRATERION_PACKAGE_ID,
          arguments: { name: nameBytes, apiAddr, encryptionMode: mode },
        }),
      );
      fn = "kraterion::create_grant_and_share_bucket";
      summary = `Create bucket "${args.name}" (${args.encryptionMode}) with API access granted to ${shorten(apiAddr)}`;
    } else {
      tx.add(
        kraterion.createAndShareBucket({
          package: KRATERION_PACKAGE_ID,
          arguments: { name: nameBytes, encryptionMode: mode },
        }),
      );
      fn = "kraterion::create_and_share_bucket";
      summary = `Create bucket "${args.name}" (${args.encryptionMode}); API access NOT granted`;
    }

    return finalize(tx, fn, summary, { senderHint: senderAddress });
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
        arguments: { bucket: bucket.kraterion_bucket_object_id, apiAddr },
      }),
    );
    const summary = `Grant API access on "${bucket.name}" to ${shorten(apiAddr)}`;
    return finalize(tx, "kraterion::grant_api_access", summary, {
      senderHint: senderAddress,
    });
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
        arguments: { bucket: bucket.kraterion_bucket_object_id },
      }),
    );
    const summary = `Revoke ALL API access on "${bucket.name}". The gateway will no longer be able to read or write into this bucket.`;
    return finalize(tx, "kraterion::revoke_all_api_access", summary, {
      senderHint: senderAddress,
    });
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
      // Move's set_bucket_visibility is idempotent and emits no event in
      // this case, so submitting it would burn gas for nothing.
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
        arguments: { bucket: bucket.kraterion_bucket_object_id, encryptionMode: mode },
      }),
    );
    const summary = `Change visibility of "${bucket.name}" from ${bucket.encryption_mode} to ${args.encryptionMode}`;
    return finalize(tx, "kraterion::set_bucket_visibility", summary, {
      senderHint: senderAddress,
    });
  }
}

/**
 * Serialize via `tx.toJSON()`. Per Mysten guidance for the
 * "build-on-server, sign-on-client" pattern: do not set sender; do not
 * pin shared-object versions; let the client's SDK resolve fresh
 * versions at sign time. The dashboard's `useSignAndExecuteTransaction`
 * calls `setSenderIfNotSet` for us.
 */
async function finalize(
  tx: Transaction,
  fn: string,
  summary: string,
  ctx: BuildContext,
): Promise<PrepareTxResponse> {
  const tx_json = await tx.toJSON();
  return {
    tx_json,
    expected: {
      package_id: KRATERION_PACKAGE_ID,
      function: fn,
      summary,
      sender_hint: ctx.senderHint,
    },
  };
}

function shorten(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
