/**
 * Formatting helpers — no React. `walrusAggregatorUrl` reads the network-aware
 * aggregator base from `env`; the rest are pure.
 */

import { env } from "./env";

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

/** Format bytes as `1.4 KB`, `12 MB`, etc. Accepts a stringified BigInt
 *  because the wire shape encodes `size_bytes` / `funding_pool_wal` as strings. */
export function formatBytes(input: string | number | bigint): string {
  let n: number;
  if (typeof input === "string") n = Number(input);
  else if (typeof input === "bigint") n = Number(input);
  else n = input;
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 B";

  let i = 0;
  let v = n;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  // 1 decimal for KB+, integer for B.
  const formatted = i === 0 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 0 : 1);
  return `${formatted} ${UNITS[i]}`;
}

/** Format a MiB count using the smallest readable unit. Mirrors the
 *  `formatBytes` ladder (`1 MB`, `1.5 GB`, `2.1 TB`) so storage values
 *  read identically whether they came from raw bytes or from MB-typed
 *  fields on the wire.
 *
 *  Use this for `reserved_mb`, `used_mb`, resize tier labels — i.e.
 *  anywhere the dashboard talks about storage size. */
export function formatStorageMb(mb: number | string): string {
  const n = typeof mb === "string" ? Number(mb) : mb;
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n === 0) return "0 MB";
  // Promote to bytes so the standard ladder handles the unit pick. We
  // start the cursor at "MB" so values < 1 MB still read in MB (the
  // smallest unit the storage system tracks), not in KB.
  let v = n;
  let i = 2; // MB
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  const formatted = v >= 100 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 1 : 2);
  return `${stripTrailingZero(formatted)} ${UNITS[i]}`;
}

function stripTrailingZero(s: string): string {
  return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

/** Truncate a Sui address / object id to `0x1234…abcd`. */
export function formatAddress(addr: string, lead = 6, trail = 4): string {
  if (!addr) return "";
  if (addr.length <= lead + trail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-trail)}`;
}

/** Format ISO date string as `2 minutes ago`, `yesterday`, `Mar 12, 2026`. */
export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  if (diffDay < 14) return "a week ago";
  if (diffDay < 31) return `${Math.round(diffDay / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format WAL (u64 MIST-per-WAL, 9 decimals) — wire shape is the
 *  stringified BigInt. */
export function formatWal(stringifiedBigInt: string): string {
  const n = Number(stringifiedBigInt);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0 WAL";
  const wal = n / 1_000_000_000;
  if (wal < 0.001) return "<0.001 WAL";
  if (wal < 1) return `${wal.toFixed(3)} WAL`;
  if (wal < 100) return `${wal.toFixed(2)} WAL`;
  return `${wal.toFixed(0)} WAL`;
}

/** Suiscan link for testnet / mainnet by tx digest. */
export function suiscanTxUrl(digest: string, network: "testnet" | "mainnet" | "devnet" = "testnet"): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`;
}

/** Suiscan link by object id. */
export function suiscanObjectUrl(objectId: string, network: "testnet" | "mainnet" | "devnet" = "testnet"): string {
  return `https://suiscan.xyz/${network}/object/${objectId}`;
}

/** Suiscan link by Sui address. */
export function suiscanAddressUrl(address: string, network: "testnet" | "mainnet" | "devnet" = "testnet"): string {
  return `https://suiscan.xyz/${network}/account/${address}`;
}

/** Walruscan link for a blob id. */
export function walruscanUrl(blobId: string): string {
  return `https://walruscan.com/testnet/blob/${blobId}`;
}

/** Direct Walrus aggregator URL for a blob id. Returns the raw bytes
 *  (the actual blob content) rather than an explorer page. Useful
 *  while Walruscan doesn't index PooledBlobs — the aggregator is the
 *  only public surface where you can prove the blob exists by
 *  fetching it. JSON blobs (e.g. K5 manifests) render inline in the
 *  browser; binary blobs download or get guessed from bytes. */
export function walrusAggregatorUrl(blobId: string): string {
  // Network-aware: `env.walrusAggregatorUrl` is the mainnet/testnet aggregator
  // from NEXT_PUBLIC_WALRUS_AGGREGATOR_URL (defaults to testnet).
  return `${env.walrusAggregatorUrl.replace(/\/$/, "")}/v1/blobs/${blobId}`;
}
