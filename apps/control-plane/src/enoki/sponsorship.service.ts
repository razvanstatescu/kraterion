import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Redis } from "ioredis";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import { gasStatusError, gasTx } from "@kraterion/walrus-client";
import { ControlPlaneError } from "../errors/control-plane-error.js";
import { REDIS } from "../redis/redis.module.js";
import { GasPoolService } from "../sui/gas-pool.service.js";
import { OperatorKeypairService } from "../sui/operator-keypair.service.js";
import { SuiClientService } from "../sui/sui-client.service.js";

/**
 * Self-hosted sponsored-transaction service (replaces Enoki).
 *
 * Sui sponsored transactions let the user be the tx `sender` while a
 * different wallet — here the platform's `api_decryption` operator — owns
 * and pays for gas. Both parties sign the same `TransactionData`. We already
 * run a Redis-coordinated gas-coin pool for that operator wallet
 * (`GasCoinPool`), so sponsoring a user tx costs only the real gas, with no
 * third-party seat fee.
 *
 * Flow:
 *
 *   1. `PrepareTxService` builds a single-Move-call PTB and hands us the
 *      kind-bytes (`tx.build({ onlyTransactionKind: true })`).
 *   2. `createSponsored` reconstructs the tx, sets `sender = user`,
 *      `gasOwner = operator`, leases a pool coin as gas payment, builds the
 *      full `TransactionData`, and signs it as the **sponsor**. It stashes
 *      the built bytes + sponsor signature + leased coin id in Redis keyed
 *      by the tx digest (5-min TTL), and returns `{ digest, bytes }`.
 *   3. The dashboard signs those same `bytes` with the user's zkLogin key.
 *   4. `executeSponsored` looks up the reservation by digest and submits the
 *      tx with both signatures `[user, sponsor]`, then releases the coin.
 *
 * The kind-bytes are always server-built (the client never supplies them),
 * so the trust boundary is that we only ever sponsor PTBs we constructed;
 * `allowedMoveCallTargets` stays as a defense-in-depth guard that the
 * reconstructed PTB calls nothing outside the per-request target set.
 */

/** Redis TTL for a pending sponsorship: covers build → user-sign → execute. */
const RESERVATION_TTL_SECONDS = 300;

export interface CreateSponsoredArgs {
  /** Base64 of `tx.build({ client, onlyTransactionKind: true })`. */
  transactionKindBytes: string;
  /** The user's (zkLogin) address — becomes the tx `sender`. */
  sender: string;
  /** Per-request Move-call target allow-list. Always set; keystone guard. */
  allowedMoveCallTargets: string[];
  /** Reserved for parity with the previous interface; unused server-side. */
  allowedAddresses?: string[];
}

export interface SponsoredTx {
  digest: string;
  /** Base64 BCS bytes of the gas-paid transaction the user signs. */
  bytes: string;
}

interface Reservation {
  /** Base64 of the full sponsored `TransactionData` the user signs. */
  bytes: string;
  /** The operator's sponsor signature over `bytes`. */
  sponsorSignature: string;
  /** Leased gas-coin object id, so execute can return it to the pool. */
  gasObjectId: string;
  /** Leased coin balance (MIST) at lease time — lets execute recompute the
   *  new balance from effects when returning the coin to the pool. */
  gasObjectBalance: string;
}

@Injectable()
export class SponsorshipService {
  private readonly logger = new Logger(SponsorshipService.name);

  constructor(
    private readonly gasPool: GasPoolService,
    private readonly operator: OperatorKeypairService,
    private readonly sui: SuiClientService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Sponsorship is self-hosted; available once the operator wallet loads. */
  isConfigured(): boolean {
    return this.gasPool.isReady();
  }

  async createSponsored(args: CreateSponsoredArgs): Promise<SponsoredTx> {
    if (args.allowedMoveCallTargets.length === 0) {
      throw new ControlPlaneError(
        "InternalError",
        "Refusing to sponsor a transaction with an empty Move-call allow-list",
      );
    }

    const client = this.sui.get();
    const operatorAddress = this.operator.getAddress();
    const signer = this.operator.getKeypair();

    const tx = Transaction.fromKind(fromBase64(args.transactionKindBytes));
    assertOnlyAllowedTargets(tx, new Set(args.allowedMoveCallTargets));

    const lease = await this.gasPool.leaseForSponsor();
    try {
      tx.setSender(args.sender);
      tx.setGasOwner(operatorAddress);
      tx.setGasPayment([
        { objectId: lease.objectId, version: lease.version, digest: lease.digest },
      ]);
      tx.setGasBudget(this.gasPool.sponsorGasBudgetMist);

      // Build the full TransactionData once, then derive its digest from the
      // same built data so create/execute agree on the correlation key.
      const bytes = await tx.build({ client });
      const digest = await tx.getDigest({ client });
      const sponsorSignature = (await signer.signTransaction(bytes)).signature;

      const reservation: Reservation = {
        bytes: toBase64(bytes),
        sponsorSignature,
        gasObjectId: lease.objectId,
        gasObjectBalance: lease.balance,
      };
      await this.redis.set(
        reservationKey(digest),
        JSON.stringify(reservation),
        "EX",
        RESERVATION_TTL_SECONDS,
      );

      return { digest, bytes: toBase64(bytes) };
    } catch (err) {
      // Build/sign failed — return the coin immediately rather than waiting
      // for the lease TTL to reclaim it.
      await this.gasPool
        .releaseSponsorLease(lease.objectId)
        .catch((e) =>
          this.logger.warn(
            `sponsor lease release (create failure) failed for ${lease.objectId}: ${(e as Error).message}`,
          ),
        );
      throw err;
    }
  }

  async executeSponsored(args: {
    digest: string;
    signature: string;
  }): Promise<{ digest: string }> {
    const raw = await this.redis.get(reservationKey(args.digest));
    if (!raw) {
      throw new ControlPlaneError(
        "InvalidArgument",
        "Sponsored transaction not found or expired. Prepare it again and retry.",
        { reason: "reservation-missing" },
      );
    }
    const reservation = JSON.parse(raw) as Reservation;
    const client = this.sui.get();
    let leaseReturned = false;

    try {
      const result = await client.core.executeTransaction({
        transaction: fromBase64(reservation.bytes),
        signatures: [args.signature, reservation.sponsorSignature],
        include: { effects: true },
      });
      const tx = gasTx(result);
      // Return the gas coin to the pool using the tx effects (deterministic
      // new version) — works for both success and on-chain-revert, and avoids
      // the refetch race. Effects are present on both result variants.
      await this.gasPool
        .releaseSponsorLeaseFromEffects(
          reservation.gasObjectId,
          tx.effects,
          BigInt(reservation.gasObjectBalance),
        )
        .catch((e) =>
          this.logger.warn(
            `sponsor lease release (effects) failed for ${reservation.gasObjectId}: ${(e as Error).message}`,
          ),
        );
      leaseReturned = true;

      const statusError = gasStatusError(tx);
      if (statusError) {
        throw new ControlPlaneError(
          "InvalidArgument",
          `Sponsored transaction failed on-chain: ${statusError}`,
          { reason: "onchain-failure" },
        );
      }
      return { digest: tx.digest };
    } finally {
      await this.redis.del(reservationKey(args.digest)).catch(() => undefined);
      // Only reached if executeTransaction threw before returning effects
      // (e.g. a network error) — recover the coin ref from chain.
      if (!leaseReturned) {
        await this.gasPool
          .releaseSponsorLease(reservation.gasObjectId)
          .catch((e) =>
            this.logger.warn(
              `sponsor lease release (refetch) failed for ${reservation.gasObjectId}: ${(e as Error).message}`,
            ),
          );
      }
    }
  }
}

function reservationKey(digest: string): string {
  return `sponsor:reservation:${digest}`;
}

/**
 * Defense-in-depth guard: every `MoveCall` in the reconstructed PTB must
 * target something on the per-request allow-list. The kind-bytes are always
 * server-built, so this can't be tripped by a normal client — it's a
 * backstop against a future bug that would let an unexpected call slip into
 * a sponsored PTB.
 */
function assertOnlyAllowedTargets(tx: Transaction, allowed: Set<string>): void {
  const data = tx.getData();
  for (const command of data.commands) {
    const call = command.MoveCall;
    if (!call) continue;
    const target = `${call.package}::${call.module}::${call.function}`;
    if (!allowed.has(target)) {
      throw new ControlPlaneError(
        "InvalidArgument",
        `Sponsored transaction calls a non-allow-listed target: ${target}`,
        { reason: "target-not-allowed", target },
      );
    }
  }
}
