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
import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { MIST_PER_SUI } from "@mysten/sui/utils";

const SUI_COIN_TYPE = "0x2::sui::SUI";

/** Minimal internal view of a coin — normalized from `core.listCoins`
 *  (`Coin`) rows, keeping the `coinObjectId` name the pool uses internally. */
interface OwnedCoin {
  coinObjectId: string;
  version: string;
  digest: string;
  balance: string;
}

/** Unwrap a Core-API transaction result's inner `Transaction` (present on
 *  both the success and failed variants — the gas coin still moves on a
 *  revert, so effects are always available). */
function txOf(
  res: SuiClientTypes.TransactionResult<{ effects: true }>,
): SuiClientTypes.Transaction<{ effects: true }> {
  return res.$kind === "Transaction" ? res.Transaction : res.FailedTransaction;
}

/**
 * Unwrap a {@link GasExecuteResult} to its inner `Transaction` — the object
 * carrying `.effects` (status/gasObject/changedObjects), `.digest`, and
 * `.events`. Use at every call site that consumes `pool.execute(...)`:
 *
 * ```ts
 * const tx = gasTx(await pool.execute(txb));
 * if (!tx.effects.status.success) throw new Error(gasStatusError(tx));
 * const digest = tx.digest;
 * ```
 *
 * Replaces the JSON-RPC-era `result.effects?.status?.status === "success"` /
 * `result.digest` shape (Sui deprecated JSON-RPC — /docs/json-rpc-migration.md).
 */
export function gasTx<Include extends SuiClientTypes.TransactionInclude>(
  res: SuiClientTypes.TransactionResult<Include>,
): SuiClientTypes.Transaction<Include> {
  return res.$kind === "Transaction" ? res.Transaction : res.FailedTransaction;
}

/** Human-readable status error from an unwrapped transaction (`null` on success). */
export function gasStatusError(
  tx: SuiClientTypes.Transaction<{ effects: true }>,
): string | null {
  return tx.effects.status.success ? null : JSON.stringify(tx.effects.status.error);
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
  exists(...keys: string[]): Promise<number>;
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

/** Result of a pooled transaction execution. Always includes effects;
 *  events / object types are included on request. */
export type GasExecuteResult = SuiClientTypes.TransactionResult<{
  effects: true;
  events: true;
  objectTypes: true;
}>;

/** A bound `pool.execute` — pass this where a raw signer used to be
 *  threaded (e.g. the worker's archive helpers). Option names are kept
 *  from the JSON-RPC era; internally they map to the Core API `include`
 *  flags (`events`, `objectTypes`). */
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

/** A leased gas coin handed to the sponsor path. Nameable (exported) so
 *  consumers can annotate return types across package boundaries. */
export interface SponsorLease {
  objectId: string;
  version: string;
  digest: string;
  balance: string;
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
      suiClient: ClientWithCoreApi;
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
      const res = await suiClient.core.signAndExecuteTransaction({
        transaction: tx,
        signer,
        include: {
          effects: true,
          events: options.showEvents ?? false,
          objectTypes: options.showObjectChanges ?? false,
        },
      });
      // The gas coin is consumed even on an on-chain revert, so its
      // version always advances — recover the new ref from effects.
      const effects = txOf(res).effects;
      const ref = gasRefFromEffects(effects);
      const newBalance = estimateNewBalance(lease.balance, effects);
      await this.release(lease.objectId, ref ?? lease, newBalance, cfg);
      return res as GasExecuteResult;
    } catch (err) {
      // RPC/build error: the coin may or may not have moved. Re-fetch the
      // truth from chain so we never reuse a stale version.
      await this.releaseByRefetch(lease.objectId, cfg);
      throw err;
    }
  }

  /**
   * Gas budget (MIST) the pool provisions per leased coin — also the budget
   * a sponsored tx should set. Exposed so the sponsor path can build a tx
   * whose budget matches what the pooled coin can actually cover.
   */
  get gasBudgetMist(): bigint {
    return this.cfg.gasBudgetMist;
  }

  /**
   * Lease a pool coin for an **externally-signed** (sponsored) transaction.
   *
   * Unlike {@link execute}, the caller holds the lease across a client
   * round-trip (build → user signs → execute), so we use a longer TTL than
   * the default lease. The caller MUST call {@link releaseSponsorLease} once
   * the tx settles (or fails); if the process crashes, the lease TTL still
   * reclaims the coin on the next reconcile.
   */
  async leaseForSponsor(ttlMs = 300_000): Promise<SponsorLease> {
    return this.acquire(ttlMs);
  }

  /**
   * Return a sponsor lease to the pool, re-reading the coin's current ref
   * from chain. Use for the failure path (tx never executed) where there are
   * no effects to recover the new ref from.
   */
  async releaseSponsorLease(objectId: string): Promise<void> {
    await this.releaseByRefetch(objectId, this.cfg);
  }

  /**
   * Return a sponsor lease after a *successful* execution, recovering the
   * gas coin's new version directly from the tx effects — exactly like
   * {@link execute} does. This is deterministic and avoids the read-your-own-
   * write race a refetch can hit, which would otherwise leave a stale coin
   * version in Redis and fail the next lease with "provided version doesn't
   * match". Falls back to refetch if effects don't carry the gas ref.
   */
  async releaseSponsorLeaseFromEffects(
    objectId: string,
    effects: SuiClientTypes.TransactionEffects,
    oldBalanceMist: bigint,
  ): Promise<void> {
    const ref = gasRefFromEffects(effects);
    if (ref) {
      await this.release(
        objectId,
        ref,
        estimateNewBalance(oldBalanceMist.toString(), effects),
        this.cfg,
      );
    } else {
      await this.releaseByRefetch(objectId, this.cfg);
    }
  }

  private async acquire(
    ttlMs: number = this.cfg.leaseTtlMs,
  ): Promise<{ objectId: string } & CoinRecord> {
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
        ttlMs,
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
        this.log(`gas pool ${this.deps.address}: free set empty — reconciling from chain`);
        await this.reconcile().catch((e) =>
          this.log(`gas pool reconcile failed: ${(e as Error).message}`),
        );
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
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { object } = await this.deps.suiClient.core.getObject({
          objectId,
          include: { json: true },
        });
        if (object) {
          await this.release(
            objectId,
            { objectId, version: String(object.version), digest: object.digest },
            coinBalanceFromJson(object.json),
            cfg,
          );
          return;
        }
      } catch (e) {
        this.log(
          `gas pool refetch ${attempt}/3 failed for ${objectId}: ${(e as Error).message}`,
        );
      }
      await sleep(200 * attempt);
    }
    // Couldn't refresh after retries — park the coin in `dust` (drop the
    // lease, remove from free) so the next rebalance reclaims it from chain
    // instead of leaving it orphaned in `data`.
    await this.deps.redis.eval(
      PARK_DUST_LUA,
      3,
      this.kFree,
      this.kData,
      this.kDust,
      objectId,
      this.leasePrefix + objectId,
    );
  }

  // === Maintenance ===

  /** Reconcile on boot (leader-locked) — adopts the wallet's on-chain coins. */
  async ensureInitialized(): Promise<void> {
    await this.reconcile();
  }

  /** Periodic maintenance — same reconcile (merge dust, top up, re-adopt). */
  async rebalance(): Promise<void> {
    await this.reconcile();
  }

  /**
   * Reconcile the free-set with on-chain truth (leader-locked). Adopts the
   * wallet's usable SUI coins directly as pool coins; merges any too-small
   * coins into a treasury and mints fresh ones only if short of K. This is
   * the single source of truth — `free` always reflects real, current coins,
   * so the pool self-heals if the Redis bookkeeping ever drifts.
   */
  async reconcile(): Promise<void> {
    await this.withLock(() => this.reconcileLocked());
  }

  private async reconcileLocked(): Promise<void> {
    const { suiClient, address } = this.deps;
    const cfg = this.cfg;
    const owned: OwnedCoin[] = (
      await suiClient.core.listCoins({ owner: address, coinType: SUI_COIN_TYPE })
    ).objects.map((c) => ({
      coinObjectId: c.objectId,
      version: String(c.version),
      digest: c.digest,
      balance: c.balance,
    }));
    if (owned.length === 0) {
      this.log(`gas pool ${address}: wallet holds no SUI`);
      return;
    }

    // In-flight (leased) coins must not be touched.
    const leased = new Set<string>();
    for (const c of owned) {
      if ((await this.deps.redis.exists(this.leasePrefix + c.coinObjectId)) > 0) {
        leased.add(c.coinObjectId);
      }
    }
    const avail = owned
      .filter((c) => !leased.has(c.coinObjectId))
      .sort((a, b) => (BigInt(b.balance) > BigInt(a.balance) ? 1 : -1));
    if (avail.length === 0) return; // everything leased

    const treasury = avail[0]!;
    let poolCoins = avail
      .slice(1)
      .filter((c) => BigInt(c.balance) >= cfg.gasBudgetMist);
    const dust = avail
      .slice(1)
      .filter((c) => BigInt(c.balance) < cfg.gasBudgetMist)
      .map((c) => c.coinObjectId);
    const short = Math.max(0, cfg.size - poolCoins.length);
    let treasuryRef: GasObjectRef = {
      objectId: treasury.coinObjectId,
      version: treasury.version,
      digest: treasury.digest,
    };

    if (dust.length > 0 || short > 0) {
      const minted = await this.mergeAndSplit(treasury, dust, short);
      poolCoins = poolCoins.concat(minted.coins);
      if (minted.treasuryRef) treasuryRef = minted.treasuryRef;
      this.log(`gas pool ${address}: merged ${dust.length} dust, minted ${short}`);
    }

    const finalCoins = poolCoins.slice(0, cfg.size);
    const entries: string[] = [];
    for (const c of finalCoins) {
      entries.push(
        c.coinObjectId,
        JSON.stringify({ version: String(c.version), digest: c.digest, balance: c.balance }),
      );
    }
    const added = (await this.deps.redis.eval(
      RESET_POOL_LUA,
      3,
      this.kFree,
      this.kData,
      this.kDust,
      JSON.stringify(entries),
      this.kTreasury,
      JSON.stringify(treasuryRef),
      this.leasePrefix,
    )) as number;
    this.log(`gas pool ${address}: free=${added} coins`);
  }

  /**
   * On-chain: merge `dust` coins into the treasury and mint `count` fresh
   * 1-coin payouts. Pins gas to the treasury so leased coins are untouched.
   * Returns the freshly-created coins + the treasury's new reference.
   */
  private async mergeAndSplit(
    treasury: OwnedCoin,
    dust: string[],
    count: number,
  ): Promise<{ coins: OwnedCoin[]; treasuryRef: GasObjectRef | null }> {
    const { suiClient, address } = this.deps;
    const cfg = this.cfg;
    const tx = new Transaction();
    tx.setSender(address);
    tx.setGasPayment([
      { objectId: treasury.coinObjectId, version: treasury.version, digest: treasury.digest },
    ]);
    tx.setGasBudget(cfg.gasBudgetMist * 4n); // merge+split is a bit heavier
    if (dust.length > 0) {
      tx.mergeCoins(
        tx.gas,
        dust.map((id) => tx.object(id)),
      );
    }
    if (count > 0) {
      const split = tx.splitCoins(
        tx.gas,
        Array.from({ length: count }, () => tx.pure.u64(cfg.perCoinMist)),
      );
      tx.transferObjects(
        Array.from({ length: count }, (_unused, i) => split[i]!),
        address,
      );
    }

    const res = await suiClient.core.signAndExecuteTransaction({
      transaction: tx,
      signer: this.deps.signer,
      include: { effects: true },
    });
    const effects = txOf(res).effects;
    if (!effects.status.success) {
      throw new Error(
        `gas pool ${address}: merge/split tx failed: ${JSON.stringify(effects.status.error)}`,
      );
    }

    // This tx only ever creates SUI coins (splitCoins from gas), so every
    // freshly-created object other than the gas coin is a new pool coin.
    // `changedObjects` replaces the old `objectChanges`; created objects
    // carry `idOperation === 'Created'` with their output ref.
    const coins: OwnedCoin[] = [];
    for (const c of effects.changedObjects) {
      if (c.idOperation !== "Created") continue;
      if (c.objectId === effects.gasObject?.objectId) continue;
      if (c.outputVersion == null || !c.outputDigest) continue;
      coins.push({
        coinObjectId: c.objectId,
        version: String(c.outputVersion),
        digest: c.outputDigest,
        balance: cfg.perCoinMist.toString(),
      });
    }
    return { coins, treasuryRef: gasRefFromEffects(effects) };
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

// Park a coin in dust (drop its lease, remove from free). KEYS: free,
// data, dust. ARGV: oid, leaseKey.
const PARK_DUST_LUA = `
redis.call('DEL', ARGV[2])
redis.call('SREM', KEYS[1], ARGV[1])
redis.call('SADD', KEYS[3], ARGV[1])
return 1
`;

// Replace the pool with the reconciled coin set. Clears free/data/dust,
// then rebuilds data from `entries` and adds each to free UNLESS it has an
// active lease (in-flight). Sets treasury. Returns the new free size.
// KEYS: free, data, dust. ARGV: entries-json([oid,rec,...]), treasury-key,
// treasury-ref-json, lease-prefix.
const RESET_POOL_LUA = `
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
local entries = cjson.decode(ARGV[1])
for i = 1, #entries, 2 do
  local oid = entries[i]
  redis.call('HSET', KEYS[2], oid, entries[i+1])
  if redis.call('EXISTS', ARGV[4]..oid) == 0 then
    redis.call('SADD', KEYS[1], oid)
  end
end
redis.call('SET', ARGV[2], ARGV[3])
return redis.call('SCARD', KEYS[1])
`;

// === pure helpers ===

function gasRefFromEffects(
  effects: SuiClientTypes.TransactionEffects,
): GasObjectRef | null {
  // `gasObject` is a `ChangedObject`; its post-tx ref is the output side.
  const g = effects.gasObject;
  if (g && g.objectId && g.outputVersion != null && g.outputDigest) {
    return { objectId: g.objectId, version: String(g.outputVersion), digest: g.outputDigest };
  }
  return null;
}

function estimateNewBalance(
  oldBalance: string,
  effects: SuiClientTypes.TransactionEffects,
): bigint {
  // `gasUsed` is a `GasCostSummary` (always present), fields are decimal strings.
  const g = effects.gasUsed;
  let used =
    BigInt(g.computationCost) + BigInt(g.storageCost) - BigInt(g.storageRebate);
  if (used < 0n) used = 0n;
  const next = BigInt(oldBalance) - used;
  return next < 0n ? 0n : next;
}

function coinBalanceFromJson(json: Record<string, unknown> | null): bigint {
  // `core.getObject({ include: { json: true } })` returns the Move struct as
  // JSON. A `0x2::coin::Coin<T>` has a top-level `balance` (u64 as string).
  const raw = json?.["balance"];
  if (typeof raw === "string") return BigInt(raw);
  if (typeof raw === "number") return BigInt(raw);
  if (typeof raw === "bigint") return raw;
  return 0n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
