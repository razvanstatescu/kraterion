/**
 * Redis-coordinated gas-coin pool ("gas station") for a single Sui wallet.
 *
 * Problem it solves: a wallet with one SUI coin can only have one
 * transaction in flight — an owned object (the gas coin included) is
 * version-locked, so concurrent signs equivocate ("Object … already
 * locked by a different transaction" / "object is unavailable for
 * consumption, current version: …"). That's what 504s the gateway under
 * parallel uploads.
 *
 * The pool keeps **K** gas coins and leases a *distinct* one per
 * transaction, so up to K transactions run concurrently without
 * contending. After each tx it reads the gas coin's new version from the
 * effects and returns it to the pool.
 *
 * Why Redis: the same wallet (`api_decryption`) is signed from two
 * processes (gateway + control-plane), so an in-memory pool can't
 * coordinate. The free-list, per-coin version bookkeeping, leases (with a
 * TTL for crash recovery), and the leader lock for maintenance all live in
 * Redis, keyed by wallet address.
 *
 * Maintenance ("merge the dust"): coins drain unevenly; a coin that drops
 * below the gas budget can't pay for a tx, so it's parked as "dust". A
 * periodic, leader-locked `rebalance()` merges dust back into a treasury
 * coin and re-splits fresh pool coins to refill to K. Rebalance pins its
 * own gas to the treasury coin and only touches treasury + dust, so it
 * never races a leased coin.
 */
import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import type { Signer } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { MIST_PER_SUI } from "@mysten/sui/utils";

const SUI_COIN_TYPE = "0x2::sui::SUI";
const SUI_COIN_OBJECT_TYPE = "0x2::coin::Coin<0x2::sui::SUI>";

/** Minimal view of a `getCoins` row — avoids depending on the SDK's
 *  exact `CoinStruct` export. */
interface OwnedCoin {
  coinObjectId: string;
  version: string;
  digest: string;
  balance: string;
}

/**
 * Minimal structural view of an ioredis client — only the calls the pool
 * makes. Apps pass their existing ioredis instance (cast at the call
 * site) so this package needs no ioredis dependency.
 */
export interface PoolRedis {
  eval(script: string, numkeys: number, ...args: Array<string | number>): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  hgetall(key: string): Promise<Record<string, string>>;
  set(
    key: string,
    value: string,
    mode: "PX",
    ttl: number,
    cond: "NX",
  ): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

export interface GasPoolConfig {
  /** Target number of leasable coins. */
  size: number;
  /** Target balance per leasable coin (MIST). */
  perCoinMist: bigint;
  /** Gas budget per transaction (MIST). Also the minimum usable balance:
   *  a coin below this is parked as dust. */
  gasBudgetMist: bigint;
  /** Lease TTL (ms) — a crashed process's coin is reclaimed after this. */
  leaseTtlMs: number;
  /** Max time (ms) to wait for a free coin before giving up. */
  acquireTimeoutMs: number;
}

/** Result of a pooled transaction execution. */
export type GasExecuteResult = Awaited<
  ReturnType<SuiJsonRpcClient["signAndExecuteTransaction"]>
>;

/** A bound `pool.execute` — pass this where a raw signer used to be
 *  threaded (e.g. the worker's archive helpers). */
export type GasExecute = (
  tx: Transaction,
  options?: { showEvents?: boolean; showObjectChanges?: boolean },
) => Promise<GasExecuteResult>;

export const DEFAULT_GAS_POOL_CONFIG: GasPoolConfig = {
  size: 16,
  perCoinMist: MIST_PER_SUI, // 1 SUI
  gasBudgetMist: MIST_PER_SUI / 10n, // 0.1 SUI
  leaseTtlMs: 60_000,
  acquireTimeoutMs: 30_000,
};

/**
 * Build a partial config from env: `GAS_POOL_SIZE` (count),
 * `GAS_POOL_COIN_SUI` and `GAS_POOL_BUDGET_SUI` (decimal SUI). Anything
 * unset falls back to {@link DEFAULT_GAS_POOL_CONFIG}.
 */
export function gasPoolConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): Partial<GasPoolConfig> {
  const out: Partial<GasPoolConfig> = {};
  const size = Number(env["GAS_POOL_SIZE"]);
  if (Number.isFinite(size) && size > 0) out.size = Math.floor(size);
  const coin = Number(env["GAS_POOL_COIN_SUI"]);
  if (Number.isFinite(coin) && coin > 0) {
    out.perCoinMist = BigInt(Math.round(coin * Number(MIST_PER_SUI)));
  }
  const budget = Number(env["GAS_POOL_BUDGET_SUI"]);
  if (Number.isFinite(budget) && budget > 0) {
    out.gasBudgetMist = BigInt(Math.round(budget * Number(MIST_PER_SUI)));
  }
  return out;
}

interface CoinRecord {
  version: string;
  digest: string;
  balance: string; // MIST, decimal string
}

interface GasObjectRef {
  objectId: string;
  version: string;
  digest: string;
}

// Atomic lease: pop a free coin id, mark it leased with a TTL, return its
// record. KEYS: free-set, data-hash. ARGV: lease-key-prefix, ttl-ms.
const LEASE_LUA = `
local oid = redis.call('SPOP', KEYS[1])
if not oid then return nil end
redis.call('SET', ARGV[1]..oid, '1', 'PX', tonumber(ARGV[2]))
local data = redis.call('HGET', KEYS[2], oid)
return {oid, data}
`;

// Atomic release: write the coin's new record, drop the lease, and return
// it to free (usable) or dust. KEYS: free, data, dust. ARGV: oid,
// record-json, lease-key, usable(1/0).
const RELEASE_LUA = `
redis.call('HSET', KEYS[2], ARGV[1], ARGV[2])
redis.call('DEL', ARGV[3])
if ARGV[4] == '1' then
  redis.call('SADD', KEYS[1], ARGV[1])
  redis.call('SREM', KEYS[3], ARGV[1])
else
  redis.call('SADD', KEYS[3], ARGV[1])
  redis.call('SREM', KEYS[1], ARGV[1])
end
return 1
`;

export class GasCoinPool {
  private readonly ns: string;
  private readonly kFree: string;
  private readonly kDust: string;
  private readonly kData: string;
  private readonly kTreasury: string;
  private readonly kLock: string;
  private readonly leasePrefix: string;
  private readonly log: (msg: string) => void;

  constructor(
    private readonly deps: {
      suiClient: SuiJsonRpcClient;
      redis: PoolRedis;
      signer: Signer;
      address: string;
      config?: Partial<GasPoolConfig>;
      logger?: (msg: string) => void;
    },
  ) {
    this.ns = `gaspool:${deps.address}`;
    this.kFree = `${this.ns}:free`;
    this.kDust = `${this.ns}:dust`;
    this.kData = `${this.ns}:data`;
    this.kTreasury = `${this.ns}:treasury`;
    this.kLock = `${this.ns}:lock`;
    this.leasePrefix = `${this.ns}:lease:`;
    this.log = deps.logger ?? (() => {});
  }

  private get cfg(): GasPoolConfig {
    return { ...DEFAULT_GAS_POOL_CONFIG, ...this.deps.config };
  }

  /**
   * Run `tx` using a leased pool coin as its gas, then return the coin
   * (with its advanced version) to the pool. Always requests effects so
   * the new gas-coin reference can be recovered.
   */
  async execute(
    tx: Transaction,
    options: { showEvents?: boolean; showObjectChanges?: boolean } = {},
  ) {
    const { suiClient, signer } = this.deps;
    const cfg = this.cfg;
    const lease = await this.acquire();
    tx.setGasPayment([
      { objectId: lease.objectId, version: lease.version, digest: lease.digest },
    ]);
    tx.setGasBudget(cfg.gasBudgetMist);

    try {
      const res = await suiClient.signAndExecuteTransaction({
        transaction: tx,
        signer,
        options: {
          showEffects: true,
          showEvents: options.showEvents ?? false,
          showObjectChanges: options.showObjectChanges ?? false,
        },
      });
      // The gas coin is consumed even on an on-chain revert, so its
      // version always advances — recover the new ref from effects.
      const ref = gasRefFromEffects(res);
      const newBalance = estimateNewBalance(lease.balance, res);
      await this.release(lease.objectId, ref ?? lease, newBalance, cfg);
      return res;
    } catch (err) {
      // RPC/build error: the coin may or may not have moved. Re-fetch the
      // truth from chain so we never reuse a stale version.
      await this.releaseByRefetch(lease.objectId, cfg);
      throw err;
    }
  }

  private async acquire(): Promise<{ objectId: string } & CoinRecord> {
    const cfg = this.cfg;
    const deadline = Date.now() + cfg.acquireTimeoutMs;
    let warned = false;
    for (;;) {
      const r = (await this.deps.redis.eval(
        LEASE_LUA,
        2,
        this.kFree,
        this.kData,
        this.leasePrefix,
        cfg.leaseTtlMs,
      )) as [string, string | null] | null;
      if (r && r[1]) {
        const rec = JSON.parse(r[1]) as CoinRecord;
        return { objectId: r[0], ...rec };
      }
      if (r && !r[1]) {
        // Leased a coin id with no record (shouldn't happen) — drop it.
        await this.deps.redis.del(this.leasePrefix + r[0]);
      }
      if (Date.now() > deadline) {
        throw new Error(
          `gas pool exhausted: no free coin for ${this.deps.address} within ${cfg.acquireTimeoutMs}ms`,
        );
      }
      if (!warned) {
        warned = true;
        this.log(`gas pool ${this.deps.address}: waiting for a free coin…`);
      }
      await sleep(50);
    }
  }

  private async release(
    objectId: string,
    ref: GasObjectRef,
    balanceMist: bigint,
    cfg: GasPoolConfig,
  ): Promise<void> {
    const usable = balanceMist >= cfg.gasBudgetMist;
    const rec: CoinRecord = {
      version: ref.version,
      digest: ref.digest,
      balance: balanceMist.toString(),
    };
    await this.deps.redis.eval(
      RELEASE_LUA,
      3,
      this.kFree,
      this.kData,
      this.kDust,
      objectId,
      JSON.stringify(rec),
      this.leasePrefix + objectId,
      usable ? "1" : "0",
    );
  }

  private async releaseByRefetch(objectId: string, cfg: GasPoolConfig): Promise<void> {
    try {
      const obj = await this.deps.suiClient.getObject({
        id: objectId,
        options: { showContent: true },
      });
      const data = obj.data;
      const balance = coinBalanceFromObject(obj);
      if (data) {
        await this.release(
          objectId,
          { objectId, version: String(data.version), digest: data.digest },
          balance,
          cfg,
        );
        return;
      }
    } catch (e) {
      this.log(`gas pool refetch failed for ${objectId}: ${(e as Error).message}`);
    }
    // Couldn't refresh — drop the lease so it isn't stuck; rebalance will
    // rediscover the coin from chain.
    await this.deps.redis.del(this.leasePrefix + objectId);
  }

  // === Maintenance ===

  /**
   * Ensure the pool has K coins. Leader-locked: only one process across
   * gateway/control-plane runs the on-chain split. Safe to call on every
   * boot — it no-ops once the pool is populated.
   */
  async ensureInitialized(): Promise<void> {
    const free = await this.deps.redis.smembers(this.kFree);
    if (free.length > 0) return;
    await this.withLock(async () => {
      const free2 = await this.deps.redis.smembers(this.kFree);
      if (free2.length > 0) return;
      await this.consolidateAndSplit(this.cfg.size);
      this.log(`gas pool ${this.deps.address}: initialized ${this.cfg.size} coins`);
    });
  }

  /**
   * Merge dust back into the treasury and re-split fresh coins to refill
   * the free pool to K. Leader-locked; only touches treasury + dust, never
   * a leased coin. Call on a timer.
   */
  async rebalance(): Promise<void> {
    await this.withLock(async () => {
      const free = await this.deps.redis.smembers(this.kFree);
      const need = this.cfg.size - free.length;
      const dust = await this.deps.redis.smembers(this.kDust);
      if (need <= 0 && dust.length === 0) return;
      await this.consolidateAndSplit(Math.max(need, 0));
      this.log(
        `gas pool ${this.deps.address}: rebalanced (+${Math.max(need, 0)} coins, merged ${dust.length} dust)`,
      );
    });
  }

  /**
   * On-chain: pick/refresh a treasury coin, merge all dust (and any stray
   * wallet coins not tracked) into it, split `mint` fresh pool coins, and
   * record them in Redis. Pins gas to the treasury so leased coins are
   * untouched.
   */
  private async consolidateAndSplit(mint: number): Promise<void> {
    const { suiClient, address } = this.deps;
    const cfg = this.cfg;

    // Live SUI coins owned by the wallet.
    const owned = await suiClient.getCoins({ owner: address, coinType: SUI_COIN_TYPE });
    const ownedCoins = owned.data as unknown as OwnedCoin[];
    if (ownedCoins.length === 0) {
      throw new Error(`gas pool ${address}: wallet holds no SUI to seed the pool`);
    }
    // Coins currently leasable (free) must not be touched — only merge
    // coins that are dust or untracked.
    const leasable = new Set(await this.deps.redis.smembers(this.kFree));

    // Treasury = the largest coin that isn't a leasable pool coin.
    const candidates = ownedCoins
      .filter((c: OwnedCoin) => !leasable.has(c.coinObjectId))
      .sort((a: OwnedCoin, b: OwnedCoin) =>
        BigInt(b.balance) > BigInt(a.balance) ? 1 : -1,
      );
    if (candidates.length === 0) {
      throw new Error(`gas pool ${address}: no spare coin to use as treasury`);
    }
    const treasury = candidates[0]!;
    const toMerge = candidates.slice(1).map((c: OwnedCoin) => c.coinObjectId);

    const tx = new Transaction();
    tx.setSender(address);
    tx.setGasPayment([
      { objectId: treasury.coinObjectId, version: treasury.version, digest: treasury.digest },
    ]);
    tx.setGasBudget(cfg.gasBudgetMist * 4n); // merge+split is a bit heavier
    if (toMerge.length > 0) {
      tx.mergeCoins(
        tx.gas,
        toMerge.map((id) => tx.object(id)),
      );
    }
    if (mint > 0) {
      const amounts = Array.from({ length: mint }, () =>
        tx.pure.u64(cfg.perCoinMist),
      );
      const split = tx.splitCoins(tx.gas, amounts);
      const transfers = Array.from({ length: mint }, (_unused, i) => split[i]!);
      tx.transferObjects(transfers, address);
    }

    const res = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: this.deps.signer,
      options: { showEffects: true, showObjectChanges: true },
    });
    if (res.effects?.status?.status !== "success") {
      throw new Error(
        `gas pool ${address}: consolidate tx failed: ${res.effects?.status?.error ?? "unknown"}`,
      );
    }

    // Record freshly-created coins as free + update treasury ref. Clear
    // the merged dust.
    type CreatedChange = {
      type: string;
      objectType?: string;
      objectId?: string;
      version?: string | number;
      digest?: string;
    };
    const created = ((res.objectChanges ?? []) as unknown as CreatedChange[]).filter(
      (c) => c.type === "created" && c.objectType === SUI_COIN_OBJECT_TYPE,
    );
    const adds: string[] = [];
    for (const c of created) {
      if (!c.objectId || c.version == null || !c.digest) continue;
      const rec: CoinRecord = {
        version: String(c.version),
        digest: c.digest,
        balance: cfg.perCoinMist.toString(),
      };
      adds.push(c.objectId, JSON.stringify(rec));
    }
    const treasuryRef = gasRefFromEffects(res);
    await this.deps.redis.eval(
      ADD_FRESH_LUA,
      3,
      this.kFree,
      this.kData,
      this.kDust,
      JSON.stringify(adds),
      this.kTreasury,
      JSON.stringify(treasuryRef ?? null),
    );
  }

  private async withLock(fn: () => Promise<void>): Promise<void> {
    const token = `${Date.now()}-${Math.round(Number(String(process.pid)))}`;
    const ok = await this.deps.redis.set(this.kLock, token, "PX", 60_000, "NX");
    if (ok !== "OK") return; // someone else holds it
    try {
      await fn();
    } finally {
      await this.deps.redis.del(this.kLock);
    }
  }
}

// Adds freshly-created coins to free+data, updates treasury, clears dust.
// KEYS: free, data, dust. ARGV: adds-json([oid,rec,...]), treasury-key,
// treasury-ref-json.
const ADD_FRESH_LUA = `
local adds = cjson.decode(ARGV[1])
for i = 1, #adds, 2 do
  redis.call('HSET', KEYS[2], adds[i], adds[i+1])
  redis.call('SADD', KEYS[1], adds[i])
end
redis.call('SET', ARGV[2], ARGV[3])
local dust = redis.call('SMEMBERS', KEYS[3])
for _, oid in ipairs(dust) do
  redis.call('SREM', KEYS[3], oid)
  redis.call('HDEL', KEYS[2], oid)
end
return 1
`;

// === pure helpers ===

function gasRefFromEffects(res: {
  effects?: { gasObject?: { reference?: GasObjectRef } } | null;
}): GasObjectRef | null {
  const ref = res.effects?.gasObject?.reference;
  if (ref && ref.objectId && ref.version != null && ref.digest) {
    return { objectId: ref.objectId, version: String(ref.version), digest: ref.digest };
  }
  return null;
}

function estimateNewBalance(
  oldBalance: string,
  res: {
    effects?: {
      gasUsed?: {
        computationCost?: string | number;
        storageCost?: string | number;
        storageRebate?: string | number;
      };
    } | null;
  },
): bigint {
  const g = res.effects?.gasUsed;
  let used = 0n;
  if (g) {
    used =
      BigInt(g.computationCost ?? 0) +
      BigInt(g.storageCost ?? 0) -
      BigInt(g.storageRebate ?? 0);
    if (used < 0n) used = 0n;
  }
  const next = BigInt(oldBalance) - used;
  return next < 0n ? 0n : next;
}

function coinBalanceFromObject(obj: {
  data?: { content?: unknown } | null;
}): bigint {
  const content = obj.data?.content as
    | { dataType?: string; fields?: { balance?: string } }
    | undefined;
  if (content?.dataType === "moveObject" && content.fields?.balance) {
    return BigInt(content.fields.balance);
  }
  return 0n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
