/**
 * Loads the gateway operator `SubWallet` keypair for control-plane
 * admin operations that need to sign on-chain calls
 * (`pool_vault::extend`, `pool_vault::resize_grow`).
 *
 * Same keypair the gateway loads (see
 * `apps/gateway/src/auth/gateway-keypair.service.ts`); we share the row
 * because the same on-chain identity must be on the platform reserve's
 * `authorized_callers` whitelist. Splitting would mean rotating two
 * caps + two whitelist entries every time.
 *
 * Stored as `SubWallet` with `role = 'api_decryption'` and
 * `account_id = null` — the "global gateway" wallet. Post-v1 we may
 * mint a dedicated `pool_operator` SubWallet and rotate to it; the
 * service interface won't change.
 *
 * Fails fast at boot if the row is missing (bootstrap-not-run condition).
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PrismaService } from "../prisma/prisma.service.js";
import { KeyWrappingService } from "../auth/key-wrapping.service.js";

@Injectable()
export class OperatorKeypairService implements OnModuleInit {
  private readonly logger = new Logger(OperatorKeypairService.name);
  private keypair: Ed25519Keypair | null = null;
  private address: string | null = null;
  private readonly ready: Promise<void>;
  private markReady!: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyWrapping: KeyWrappingService,
  ) {
    this.ready = new Promise<void>((resolve) => {
      this.markReady = resolve;
    });
  }

  // Load in the BACKGROUND with retry — do NOT block boot on a DB query.
  // During a rolling deploy the previous instances hold every Postgres
  // connection slot; a blocking load would crash the new container before
  // the old ones drain, deadlocking the rollout. /health is DB-free, so we
  // go healthy immediately and load once slots free.
  onModuleInit(): void {
    void this.loadWithRetry();
  }

  /** Resolves once the keypair is loaded. The gas pool awaits this. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  private async loadWithRetry(): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await this.load();
        this.markReady();
        return;
      } catch (err) {
        const wait = Math.min(15_000, 500 * attempt);
        this.logger.warn(
          `operator keypair load attempt ${attempt} failed ` +
            `(${(err as Error).message}); retrying in ${wait}ms`,
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  private async load(): Promise<void> {
    const sub = await this.prisma.subWallet.findFirst({
      where: { role: "api_decryption", account_id: null },
    });
    if (!sub) {
      throw new Error(
        "No global api_decryption SubWallet found. Run gateway bootstrap to provision it.",
      );
    }
    const seed = this.keyWrapping.unwrap(sub.mnemonic_wrapped);
    this.keypair = Ed25519Keypair.fromSecretKey(seed);
    this.address = this.keypair.toSuiAddress();
    this.logger.log(`OperatorKeypair loaded: address=${this.address}`);
  }

  getKeypair(): Ed25519Keypair {
    if (!this.keypair) {
      throw new ServiceUnavailableException(
        "Operator keypair not loaded — run gateway bootstrap to provision the SubWallet.",
      );
    }
    return this.keypair;
  }

  getAddress(): string {
    if (!this.address) {
      throw new ServiceUnavailableException(
        "Operator keypair not loaded — run gateway bootstrap to provision the SubWallet.",
      );
    }
    return this.address;
  }
}
