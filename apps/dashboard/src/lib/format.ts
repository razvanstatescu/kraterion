/**
 * Pure formatting helpers — no React, no side effects. Keep them small and
 * testable; if logic grows past a line or two, move it into a typed module.
 */

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

/** Walruscan link for a blob id. */
export function walruscanUrl(blobId: string): string {
  return `https://walruscan.com/testnet/blob/${blobId}`;
}
