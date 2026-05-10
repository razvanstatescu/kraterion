import { Injectable } from "@nestjs/common";
import type { EnokiNetwork } from "@mysten/enoki";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { asControlPlaneError, EnokiClientService } from "./enoki-client.service.js";

const NETWORK: EnokiNetwork =
  (process.env["SUI_NETWORK"] as EnokiNetwork | undefined) ?? "testnet";

export interface CreateSponsoredArgs {
  /** Base64 of `tx.build({ client, onlyTransactionKind: true })`. */
  transactionKindBytes: string;
  /** The user's zkLogin address — Enoki uses it to construct the gas envelope. */
  sender: string;
  /** Per-request Move-call target allow-list. Always set; this is the keystone. */
  allowedMoveCallTargets: string[];
  /** Per-request address allow-list. Defaults to `[sender]`. */
  allowedAddresses?: string[];
}

export interface SponsoredTx {
  digest: string;
  /** Base64 BCS bytes of the gas-paid transaction the user signs. */
  bytes: string;
}

/**
 * Thin orchestration over Enoki's sponsored-transaction API.
 *
 * Flow we run:
 *
 *   1. Caller (`PrepareTxService`) builds a `Transaction` with a single
 *      Move call (e.g. `kraterion::create_grant_and_share_bucket`) and
 *      hands us the kind-bytes via `tx.build({ client, onlyTransactionKind: true })`.
 *   2. We call `enoki.createSponsoredTransaction` with the user's
 *      address as `sender` and the precise Move target on
 *      `allowedMoveCallTargets`. Enoki validates, constructs gas, and
 *      returns the BCS bytes the *user* must sign.
 *   3. The dashboard signs those bytes with the Enoki zkLogin wallet
 *      (dApp Kit's `useSignTransaction`).
 *   4. Dashboard POSTs `{ digest, signature }` back to us, we call
 *      `enoki.executeSponsoredTransaction` to settle on-chain.
 *
 * `allowedMoveCallTargets` is the security boundary: even if a
 * malicious frontend swapped the digest for another waiting in their
 * pool, Enoki refuses to settle anything outside the per-request list.
 */
@Injectable()
export class SponsorshipService {
  constructor(private readonly enoki: EnokiClientService) {}

  isConfigured(): boolean {
    return this.enoki.isConfigured();
  }

  async createSponsored(args: CreateSponsoredArgs): Promise<SponsoredTx> {
    if (args.allowedMoveCallTargets.length === 0) {
      throw new ControlPlaneError(
        "InternalError",
        "Refusing to sponsor a transaction with an empty Move-call allow-list",
      );
    }
    const client = this.enoki.require();
    try {
      const res = await client.createSponsoredTransaction({
        network: NETWORK,
        transactionKindBytes: args.transactionKindBytes,
        sender: args.sender,
        allowedAddresses: args.allowedAddresses ?? [args.sender],
        allowedMoveCallTargets: args.allowedMoveCallTargets,
      });
      return { digest: res.digest, bytes: res.bytes };
    } catch (err) {
      asControlPlaneError(err, "Failed to create sponsored transaction");
    }
  }

  async executeSponsored(args: { digest: string; signature: string }): Promise<{ digest: string }> {
    const client = this.enoki.require();
    try {
      return await client.executeSponsoredTransaction(args);
    } catch (err) {
      asControlPlaneError(err, "Failed to execute sponsored transaction");
    }
  }
}
