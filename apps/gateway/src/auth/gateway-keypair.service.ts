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
 * Holds the gateway's `api_decryption` Ed25519 keypair as a singleton —
 * loaded once at boot from the `SubWallet` row whose role is
 * `api_decryption` and whose `account_id` is null (the shared
 * gateway-wide keypair).
 *
 * Why a service rather than per-request load: the seed is AES-unwrapped
 * and the keypair is derived on every load; doing that once at boot
 * removes a Postgres round-trip + AES-GCM op from every GetObject /
 * PutObject. The keypair address is also baked into every bucket's
 * on-chain `api_decryption_addresses` list, so it really is one-per-
 * gateway-process.
 *
 * If the SubWallet row is missing at boot we fail fast with a clear
 * message — that's a bootstrap-not-yet-run condition, not a request-
 * time issue. Per-account keypairs are post-hackathon (the shape stays
 * the same — replace the singleton with a Redis-cached LRU of
 * `account_id → keypair`).
 */
@Injectable()
export class GatewayKeypairService implements OnModuleInit {
  private readonly logger = new Logger(GatewayKeypairService.name);
  private keypair: Ed25519Keypair | null = null;
  private address: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly keyWrapping: KeyWrappingService,
  ) {}

  async onModuleInit(): Promise<void> {
    const sub = await this.prisma.subWallet.findFirst({
      where: { role: "api_decryption", account_id: null },
    });
    if (!sub) {
      throw new Error(
        "No gateway api_decryption SubWallet found. Run `pnpm -F @kraterion/gateway bootstrap`.",
      );
    }
    const seed = this.keyWrapping.unwrap(sub.mnemonic_wrapped);
    this.keypair = Ed25519Keypair.fromSecretKey(seed);
    this.address = this.keypair.toSuiAddress();
    if (this.address !== sub.sui_address) {
      throw new Error(
        `Gateway keypair address mismatch: derived ${this.address}, stored ${sub.sui_address}. ` +
          `The wrapped seed in the DB does not produce the recorded address — do not start.`,
      );
    }
    this.logger.log(`gateway keypair loaded (${this.address})`);
  }

  getKeypair(): Ed25519Keypair {
    if (!this.keypair) {
      throw new ServiceUnavailableException("Gateway keypair not initialized.");
    }
    return this.keypair;
  }

  getAddress(): string {
    if (!this.address) {
      throw new ServiceUnavailableException("Gateway keypair not initialized.");
    }
    return this.address;
  }
}
