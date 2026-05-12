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

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyWrapping: KeyWrappingService,
  ) {}

  async onModuleInit(): Promise<void> {
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
    this.keypair = Ed25519Keypair.fromSecretKey(seed);
    this.address = this.keypair.toSuiAddress();
    if (this.address !== sub.sui_address) {
      throw new Error(
        `Knowledge-indexer keypair address mismatch: derived ${this.address}, ` +
          `stored ${sub.sui_address}. Wrapped seed does not produce the recorded ` +
          `address — refusing to start.`,
      );
    }
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
