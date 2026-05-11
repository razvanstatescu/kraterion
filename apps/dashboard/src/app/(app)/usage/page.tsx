"use client";

import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { ControlPlaneError, cpFetch, type BucketJson, type S3ObjectJson } from "@/lib/api";
import { useCpSession } from "@/lib/auth";
import { formatBytes } from "@/lib/format";
import { useBuckets } from "@/lib/queries";

interface ObjectsPage {
  objects: S3ObjectJson[];
  next_cursor: string | null;
}

interface BucketUsage {
  bucket: BucketJson;
  bytes: bigint;
  objects: number;
}

/**
 * Editorial-styled usage snapshot. Splits a hero "Storage" number off
 * from per-bucket detail rows. The hero is a typographic centerpiece;
 * the proportional bar + legend lets the user see *which* bucket holds
 * the bytes without rendering a chart library.
 *
 * Fan-out: one buckets list + one objects list per bucket via
 * `useQueries` (parallel, cached for 30s). The CP caps `limit` at 100
 * for buckets and 1000 for objects, so this view is honest up to the
 * first ~100 buckets and up to 1000 objects per bucket — a real
 * billing UI would lean on a server-aggregated endpoint.
 */
export default function UsagePage() {
  const { session } = useCpSession();
  const { data: bucketsData, isLoading: bucketsLoading, error: bucketsError } = useBuckets({
    limit: 100,
  });

  const buckets = useMemo(
    () => bucketsData?.pages.flatMap((p) => p.buckets) ?? [],
    [bucketsData],
  );

  const objectQueries = useQueries({
    queries: buckets.map((b) => ({
      queryKey: ["v1", "objects", b.id, "usage"],
      queryFn: () => cpFetch<ObjectsPage>(`/v1/buckets/${b.id}/objects?limit=1000`),
      enabled: Boolean(session?.token),
      staleTime: 30_000,
    })),
  });

  const objectsLoading = objectQueries.some((q) => q.isLoading);
  const objectsError = objectQueries.find((q) => q.error)?.error;

  const { totalBytes, totalObjects, perBucket, privateCount, publicCount } = useMemo(() => {
    let totalBytes = 0n;
    let totalObjects = 0;
    let privateCount = 0;
    let publicCount = 0;
    const perBucket: BucketUsage[] = [];
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]!;
      if (b.encryption_mode === "private") privateCount += 1;
      else publicCount += 1;
      const q = objectQueries[i];
      let bytes = 0n;
      let objects = 0;
      if (q?.data) {
        for (const o of q.data.objects) {
          objects += 1;
          try {
            bytes += BigInt(o.size_bytes);
          } catch {
            // ignore malformed
          }
        }
      }
      totalBytes += bytes;
      totalObjects += objects;
      perBucket.push({ bucket: b, bytes, objects });
    }
    perBucket.sort((a, b) => (a.bytes < b.bytes ? 1 : a.bytes > b.bytes ? -1 : 0));
    return { totalBytes, totalObjects, perBucket, privateCount, publicCount };
  }, [buckets, objectQueries]);

  const isLoading = bucketsLoading || objectsLoading;
  const formattedTotal = formatBytes(totalBytes);
  const [heroValue, heroUnit] = splitFormattedBytes(formattedTotal);

  return (
    <>
      <Topbar crumbs={[{ label: "Usage" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Usage</h1>
            <p className="lead">
              Where your bytes live right now, by bucket.
            </p>
          </div>
        </div>

        {bucketsError || objectsError ? (
          <Banner
            tone="error"
            title="Couldn't load usage"
            body={
              bucketsError instanceof ControlPlaneError
                ? bucketsError.message
                : objectsError instanceof Error
                  ? objectsError.message
                  : "Try again in a moment."
            }
          />
        ) : null}

        <section className="ks-usage-hero">
          <div>
            <div className="ks-usage-hero-eyebrow">Storage used</div>
            <div className="ks-usage-hero-number">
              <span className="ks-usage-hero-value">{isLoading ? "—" : heroValue}</span>
              <span className="ks-usage-hero-unit">{isLoading ? "" : heroUnit}</span>
            </div>
            <p className="ks-usage-hero-sub">
              Across{" "}
              <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {totalObjects.toLocaleString()}
              </strong>{" "}
              {totalObjects === 1 ? "object" : "objects"} in{" "}
              <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                {buckets.length.toLocaleString()}
              </strong>{" "}
              {buckets.length === 1 ? "bucket" : "buckets"}. Every byte is encrypted with Seal
              before it leaves your browser and stored as a Walrus SharedBlob you own on-chain.
            </p>
          </div>
          <aside className="ks-usage-hero-aside">
            <Mini label="Private" value={isLoading ? "—" : privateCount.toLocaleString()} />
            <Mini label="Public-read" value={isLoading ? "—" : publicCount.toLocaleString()} />
          </aside>
        </section>

        <section className="ks-usage-section">
          <div className="ks-usage-section-head">
            <div className="ks-usage-section-title">Storage by bucket</div>
            <div className="ks-usage-section-sub">
              {isLoading
                ? "Counting bytes…"
                : totalBytes === 0n
                  ? "Nothing stored yet"
                  : `${formattedTotal} across ${perBucket.length} ${perBucket.length === 1 ? "bucket" : "buckets"}`}
            </div>
          </div>

          {totalBytes === 0n || isLoading ? (
            <div className="ks-usage-empty-bar" aria-hidden="true" />
          ) : (
            <>
              <div className="ks-usage-bar" role="img" aria-label="Storage distribution by bucket">
                {perBucket
                  .filter((row) => row.bytes > 0n)
                  .map((row, idx) => {
                    const pct = bigIntPct(row.bytes, totalBytes);
                    return (
                      <span
                        key={row.bucket.id}
                        className="ks-usage-bar-seg"
                        style={{
                          width: `${pct}%`,
                          background: segmentColor(idx),
                        }}
                        title={`${row.bucket.name} · ${formatBytes(row.bytes)} (${pct.toFixed(1)}%)`}
                      />
                    );
                  })}
              </div>

              <div className="ks-usage-legend">
                {perBucket.map((row, idx) => {
                  const pct = totalBytes === 0n ? 0 : bigIntPct(row.bytes, totalBytes);
                  const empty = row.bytes === 0n;
                  return (
                    <div className="ks-usage-legend-row" key={row.bucket.id}>
                      <span
                        className="ks-usage-legend-swatch"
                        style={{
                          background: empty ? "var(--stone-200)" : segmentColor(idx),
                        }}
                      />
                      <span className="ks-usage-legend-name">{row.bucket.name}</span>
                      <span className="ks-usage-legend-size">
                        {empty ? "—" : formatBytes(row.bytes)}
                      </span>
                      <span className="ks-usage-legend-pct">{empty ? "0%" : `${pct.toFixed(1)}%`}</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <p className="ks-usage-footer">
          Free during the hackathon — no metered billing on this view yet. When per-request
          metering lands on the gateway, this page grows a 30-day chart with requests, egress,
          and Walrus epoch-rollover costs.
        </p>
      </main>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="ks-usage-mini">
      <div className="ks-usage-mini-label">{label}</div>
      <div className="ks-usage-mini-value">{value}</div>
    </div>
  );
}

/**
 * Split "1.2 MB" → ["1.2", "MB"] so the unit can render at a smaller size
 * next to the headline number. "0 B" / "—" also round-trip safely.
 */
function splitFormattedBytes(s: string): [string, string] {
  const idx = s.lastIndexOf(" ");
  if (idx === -1) return [s, ""];
  return [s.slice(0, idx), s.slice(idx + 1)];
}

function bigIntPct(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  // Multiply by 10_000 before dividing so we keep 2 decimal places.
  return Number((part * 10_000n) / total) / 100;
}

/**
 * Segment colors for the proportional bar + legend. Index 0 (largest)
 * gets the brand accent; the rest fade through the warm stone scale.
 * No cool greys, no gradients — matches the design-system constraints.
 */
function segmentColor(idx: number): string {
  const palette = [
    "var(--krater)",
    "var(--stone-700)",
    "var(--stone-500)",
    "var(--stone-400)",
    "var(--stone-300)",
  ];
  return palette[idx % palette.length]!;
}
