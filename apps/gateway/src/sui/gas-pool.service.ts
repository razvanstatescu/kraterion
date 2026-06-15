/**
 * Gateway-side wrapper around the Redis-coordinated {@link GasCoinPool}.
 *
 * The gateway signs every register/certify/delete/vault transaction with
 * the `api_decryption` wallet. That wallet is ALSO used by the
 * control-plane operator, so the pool is keyed by wallet address in Redis
 * and both processes lease from the same set of coins. Parallel uploads
 * stop equivocating on a single gas coin (the cause of the 504s).
 *
 * Lifecycle:
 *   - `onModuleInit` builds the pool (after the keypair is loaded) and
 *     leader-locked-initializes it (splits the wallet's coin into K).
 *   - a timer runs `rebalance()` (merge dust + refill) periodically.
 */
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import type { Redis } from "ioredis";
import type { Transaction } from "@mysten/sui/transactions";
import {
  GasCoinPool,
  gasPoolConfigFromEnv,
  getSuiClient,
  type PoolRedis,
} from "@kraterion/walrus-client";
import { GatewayKeypairService } from "../auth/gateway-keypair.service.js";
import { REDIS } from "../redis/redis.module.js";

const REBALANCE_MS = Number(process.env["GAS_POOL_REBALANCE_MS"] ?? 600_000); // 10 min

@Injectable()
export class GasPoolService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GasPoolService.name);
  private pool: GasCoinPool | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly keypair: GatewayKeypairService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // Defer init until the keypair has loaded (it now loads in the
  // background so boot stays DB-free — see GatewayKeypairService). We
  // await `whenReady()` instead of calling getKeypair() eagerly, which
  // would throw before the keypair is loaded and permanently disable the
  // pool. Init itself is fire-and-forget: blocking boot on an on-chain
  // coin-split would fail the health check.
  onApplicationBootstrap(): void {
    void this.keypair
      .whenReady()
      .then(() => this.initPool())
      .catch((e) =>
        this.logger.error(`gas pool deferred init failed: ${(e as Error).message}`),
      );
  }

  private initPool(): void {
    this.pool = new GasCoinPool({
      suiClient: getSuiClient(),
      redis: this.redis as unknown as PoolRedis,
      signer: this.keypair.getKeypair(),
      address: this.keypair.getAddress(),
      config: gasPoolConfigFromEnv(),
      logger: (m) => this.logger.log(m),
    });
    void this.pool
      .ensureInitialized()
      .catch((e) => this.logger.error(`gas pool init failed: ${(e as Error).message}`));
    this.timer = setInterval(() => {
      this.pool?.rebalance().catch((e) =>
        this.logger.warn(`gas pool rebalance failed: ${(e as Error).message}`),
      );
    }, REBALANCE_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Execute a transaction using a leased pool coin as gas. */
  execute(
    tx: Transaction,
    options?: { showEvents?: boolean; showObjectChanges?: boolean },
  ) {
    if (!this.pool) {
      throw new Error("GasPoolService used before initialization");
    }
    return this.pool.execute(tx, options);
  }
}
