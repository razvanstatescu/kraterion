import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { PrismaService } from "../prisma/prisma.service.js";
import { KeyWrappingService } from "./key-wrapping.service.js";

/**
 * Worker-side counterpart to `GatewayKeypairService`. Loads the
 * `knowledge_indexer` SubWallet at boot, unwraps the seed via the same
 * `KEY_WRAPPING_MASTER_KEY` the gateway uses, and exposes the derived
 * `Ed25519Keypair` to the embedding pipeline.
 *
 * The keypair address is the one Knowledge-enable-time on-chain
 * `grant_api_access` calls add to per-bucket
 * `api_decryption_addresses` lists (K2 wires this). Seal `seal_approve`
 * accepts the worker because it sits in that list, the same mechanism
 * the gateway relies on.
 *
 * If the SubWallet row is missing at boot, we fail fast — that's a
 * "bootstrap not run yet" condition, not a request-time issue.
 */
@Injectable()
export class KnowledgeIndexerKeypairService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeIndexerKeypairService.name);
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

  /** Resolves once the keypair is loaded. */
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
          `knowledge-indexer keypair load attempt ${attempt} failed ` +
            `(${(err as Error).message}); retrying in ${wait}ms`,
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  private async load(): Promise<void> {
    const sub = await this.prisma.subWallet.findFirst({
      where: { role: "knowledge_indexer", account_id: null },
    });
    if (!sub) {
      throw new Error(
        "No knowledge_indexer SubWallet found. Run " +
          "`pnpm -F @kraterion/gateway bootstrap` to provision it.",
      );
    }
    const seed = this.keyWrapping.unwrap(sub.mnemonic_wrapped);
    const kp = Ed25519Keypair.fromSecretKey(seed);
    const addr = kp.toSuiAddress();
    if (addr !== sub.sui_address) {
      throw new Error(
        `Knowledge-indexer keypair address mismatch: derived ${addr}, ` +
          `stored ${sub.sui_address}. Wrapped seed does not produce the recorded ` +
          `address — refusing to start.`,
      );
    }
    this.keypair = kp;
    this.address = addr;
    this.logger.log(`knowledge-indexer keypair loaded (${this.address})`);
  }

  getKeypair(): Ed25519Keypair {
    if (!this.keypair) {
      throw new ServiceUnavailableException(
        "Knowledge-indexer keypair not initialized.",
      );
    }
    return this.keypair;
  }

  getAddress(): string {
    if (!this.address) {
      throw new ServiceUnavailableException(
        "Knowledge-indexer keypair not initialized.",
      );
    }
    return this.address;
  }
}
