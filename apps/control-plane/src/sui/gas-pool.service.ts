/**
 * Control-plane wrapper around the Redis-coordinated {@link GasCoinPool}.
 *
 * The control-plane operator signs admin grants, pool renewals, and
 * storage-billing resizes with the `api_decryption` wallet — the SAME
 * wallet the gateway uses. The pool is keyed by wallet address in Redis,
 * so this process and the gateway lease from one shared set of coins and
 * never pick the same coin concurrently.
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
import { OperatorKeypairService } from "./operator-keypair.service.js";
import { REDIS } from "../redis/redis.module.js";

const REBALANCE_MS = Number(process.env["GAS_POOL_REBALANCE_MS"] ?? 600_000);

@Injectable()
export class GasPoolService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GasPoolService.name);
  private pool: GasCoinPool | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly keypair: OperatorKeypairService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // `onApplicationBootstrap` so the operator keypair is loaded. Init is
  // fire-and-forget — blocking boot on an on-chain coin-split would fail
  // the health check (it did, on the first deploy attempt).
  // Defer init until the operator keypair has loaded (it now loads in the
  // background so boot stays DB-free — see OperatorKeypairService). We
  // await `whenReady()` rather than calling getKeypair() eagerly, which
  // would throw before the keypair is loaded.
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
