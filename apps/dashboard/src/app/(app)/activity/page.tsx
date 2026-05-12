"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ControlPlaneError, type ActivityEventJson } from "@/lib/api";
import { env } from "@/lib/env";
import { formatBytes, formatRelative, suiscanTxUrl } from "@/lib/format";
import { useActivity } from "@/lib/queries";

/**
 * Reverse-chronological feed of bucket + object events. Driven by the
 * CP's `/v1/activity` endpoint (`apps/control-plane/src/activity/`).
 *
 * Surfaces six kinds today:
 *   - `bucket_created` / `bucket_deleted`
 *   - `object_uploaded` / `object_deleted`
 *   - `knowledge_search` / `knowledge_ask`
 *
 * On-chain origin events (bucket-create, object-upload) carry a
 * `tx_digest` so the row links straight to Suiscan for the demo's
 * "everything is on-chain" beat.
 *
 * Filtering happens client-side on the already-loaded page: three
 * concerns the user actually slices by — what kind of event, which
 * bucket, and how recent. Until the endpoint paginates, all three
 * filters reduce the visible set in-place; the loaded events stay
 * in state.
 */
type KindGroup = "all" | "buckets" | "files" | "knowledge";
type Range = "24h" | "7d" | "30d" | "all";

const RANGE_MS: Record<Range, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  all: null,
};

function kindGroupOf(kind: ActivityEventJson["kind"]): KindGroup {
  switch (kind) {
    case "bucket_created":
    case "bucket_deleted":
      return "buckets";
    case "object_uploaded":
    case "object_deleted":
      return "files";
    case "knowledge_search":
    case "knowledge_ask":
      return "knowledge";
  }
}

export default function ActivityPage() {
  const { data, isLoading, error } = useActivity({ limit: 100 });
  const events = data?.events ?? [];

  const [kind, setKind] = useState<KindGroup>("all");
  const [bucketId, setBucketId] = useState<string>("all");
  const [range, setRange] = useState<Range>("all");

  // Distinct bucket options derived from the loaded set so we never
  // show a bucket in the dropdown that wouldn't match any row.
  const bucketOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of events) seen.set(e.bucket.id, e.bucket.name);
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  const filtered = useMemo(() => {
    const rangeMs = RANGE_MS[range];
    const minAt = rangeMs ? Date.now() - rangeMs : null;
    return events.filter((e) => {
      if (kind !== "all" && kindGroupOf(e.kind) !== kind) return false;
      if (bucketId !== "all" && e.bucket.id !== bucketId) return false;
      if (minAt !== null && new Date(e.at).getTime() < minAt) return false;
      return true;
    });
  }, [events, kind, bucketId, range]);

  return (
    <>
      <Topbar crumbs={[{ label: "Activity" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Activity</h1>
            <p className="lead">
              On-chain events and dashboard actions, newest first.
            </p>
          </div>
        </div>

        {error ? (
          <Banner
            tone="error"
            title="Failed to load activity"
            body={
              error instanceof ControlPlaneError
                ? error.message
                : "Try again in a moment."
            }
          />
        ) : isLoading ? (
          <div className="muted">Loading…</div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="info"
            title="Nothing yet"
            body="Create a bucket or upload a file to start a timeline."
          />
        ) : (
          <>
            <ActivityFilters
              kind={kind}
              setKind={setKind}
              bucketId={bucketId}
              setBucketId={setBucketId}
              range={range}
              setRange={setRange}
              bucketOptions={bucketOptions}
              totalCount={events.length}
              filteredCount={filtered.length}
            />

            {filtered.length === 0 ? (
              <div className="muted" style={{ fontSize: 14, marginTop: 16 }}>
                No events match these filters.
              </div>
            ) : (
              <div className="ks-activity-list">
                {filtered.map((e) => (
                  <Row key={e.id} event={e} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

function ActivityFilters({
  kind,
  setKind,
  bucketId,
  setBucketId,
  range,
  setRange,
  bucketOptions,
  totalCount,
  filteredCount,
}: {
  kind: KindGroup;
  setKind: (k: KindGroup) => void;
  bucketId: string;
  setBucketId: (id: string) => void;
  range: Range;
  setRange: (r: Range) => void;
  bucketOptions: Array<{ id: string; name: string }>;
  totalCount: number;
  filteredCount: number;
}) {
  return (
    <div className="ks-activity-filters">
      <div className="ks-activity-filter-group" role="group" aria-label="Event kind">
        <FilterPill active={kind === "all"} onClick={() => setKind("all")}>
          All
        </FilterPill>
        <FilterPill active={kind === "buckets"} onClick={() => setKind("buckets")}>
          Buckets
        </FilterPill>
        <FilterPill active={kind === "files"} onClick={() => setKind("files")}>
          Files
        </FilterPill>
        <FilterPill active={kind === "knowledge"} onClick={() => setKind("knowledge")}>
          Knowledge
        </FilterPill>
      </div>

      <div className="ks-activity-filter-group" role="group" aria-label="Time range">
        <FilterPill active={range === "24h"} onClick={() => setRange("24h")}>
          24h
        </FilterPill>
        <FilterPill active={range === "7d"} onClick={() => setRange("7d")}>
          7d
        </FilterPill>
        <FilterPill active={range === "30d"} onClick={() => setRange("30d")}>
          30d
        </FilterPill>
        <FilterPill active={range === "all"} onClick={() => setRange("all")}>
          All time
        </FilterPill>
      </div>

      <select
        className="ks-activity-bucket-select"
        value={bucketId}
        onChange={(e) => setBucketId(e.target.value)}
        aria-label="Filter by bucket"
      >
        <option value="all">All buckets</option>
        {bucketOptions.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>

      <span className="ks-activity-count" aria-live="polite">
        {filteredCount} of {totalCount}
      </span>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ks-filter-pill ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Row({ event }: { event: ActivityEventJson }) {
  const { icon, verb, accent } = describe(event);
  const filename = event.object ? leaf(event.object.s3_key) : null;
  const k = event.knowledge;

  return (
    <div className="ks-activity-row">
      <div className="ks-activity-icon" data-accent={accent || undefined}>
        <Icon name={icon} size={16} />
      </div>
      <div className="ks-activity-text">
        <div className="ks-activity-title">
          {verb}{" "}
          {event.object && filename ? (
            <>
              <code className="ks-activity-mono">{filename}</code>{" "}
              in{" "}
            </>
          ) : null}
          {k ? (
            <>
              <span className="ks-activity-q">&ldquo;{truncateQuery(k.query)}&rdquo;</span>{" "}
              in{" "}
            </>
          ) : null}
          <Link
            href={`/buckets/${event.bucket.id}`}
            style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {event.bucket.name}
          </Link>
        </div>
        <div className="ks-activity-sub">
          {event.bucket.encryption_mode === "private" ? "Private bucket" : "Public-read bucket"}
          {event.object ? <> · {formatBytes(event.object.size_bytes)}</> : null}
          {k ? (
            <>
              {" · "}
              {k.chunk_count} hit{k.chunk_count === 1 ? "" : "s"}
              {" · "}
              {k.latency_ms} ms
              {k.llm_model ? (
                <>
                  {" · "}
                  {k.llm_model}
                  {k.llm_tokens ? <> ({k.llm_tokens.toLocaleString()} tokens)</> : null}
                </>
              ) : null}
            </>
          ) : null}
          {event.tx_digest ? (
            <>
              {" · "}
              <a
                href={suiscanTxUrl(event.tx_digest, env.network)}
                target="_blank"
                rel="noreferrer"
                className="ks-activity-link"
              >
                View on-chain
              </a>
            </>
          ) : null}
        </div>
      </div>
      <div className="ks-activity-meta">{formatRelative(event.at)}</div>
    </div>
  );
}

function describe(event: ActivityEventJson): {
  icon: IconName;
  verb: string;
  /** Optional tint hint for the icon background. */
  accent: "krater" | "danger" | "success" | null;
} {
  switch (event.kind) {
    case "bucket_created":
      return { icon: "folder", verb: "Bucket created:", accent: "krater" };
    case "bucket_deleted":
      return { icon: "trash", verb: "Bucket deleted:", accent: "danger" };
    case "object_uploaded":
      return { icon: "upload", verb: "Uploaded", accent: "success" };
    case "object_deleted":
      return { icon: "trash", verb: "Deleted", accent: "danger" };
    case "knowledge_search":
      return { icon: "search", verb: "Searched", accent: null };
    case "knowledge_ask":
      return { icon: "info", verb: "Asked", accent: null };
  }
}

function truncateQuery(s: string): string {
  const MAX = 80;
  return s.length > MAX ? `${s.slice(0, MAX).trimEnd()}…` : s;
}

function leaf(key: string): string {
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? key;
}
