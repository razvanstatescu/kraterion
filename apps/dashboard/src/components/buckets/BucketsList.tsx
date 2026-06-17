"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError } from "@/lib/api";
import { formatBytes, formatRelative } from "@/lib/format";
import { useBuckets } from "@/lib/queries";

/**
 * Bucket list view. Infinite-scroll-style: "Load more" surfaces when
 * `next_cursor` exists. Filterable client-side over the loaded set —
 * server-side filtering by `prefix` lives on the bucket detail page.
 */
export function BucketsList() {
  const [filter, setFilter] = useState("");
  const { data, error, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useBuckets({ limit: 50 });

  const buckets = data?.pages.flatMap((p) => p.buckets) ?? [];
  const filtered = filter
    ? buckets.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    : buckets;

  if (error) {
    const message =
      error instanceof ControlPlaneError ? error.message : "Couldn't load buckets. Try again.";
    return <Banner tone="error" title="Failed to load buckets" body={message} />;
  }

  if (isLoading) {
    return (
      <div className="ks-table">
        <div className="ks-thead">
          <div style={{ flex: "2 1 0" }}>Name</div>
          <div style={{ flex: "1 1 0" }}>Visibility</div>
          <div style={{ flex: "1 1 0" }}>API access</div>
          <div style={{ flex: "1 1 0" }}>Objects</div>
          <div style={{ flex: "1 1 0" }}>Storage</div>
          <div style={{ flex: "1 1 0" }}>Created</div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ks-trow" style={{ cursor: "default" }}>
            <div style={{ flex: "2 1 0" }} className="muted">Loading…</div>
            <div style={{ flex: "1 1 0" }} />
            <div style={{ flex: "1 1 0" }} />
            <div style={{ flex: "1 1 0" }} />
            <div style={{ flex: "1 1 0" }} />
            <div style={{ flex: "1 1 0" }} />
          </div>
        ))}
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <EmptyState
        icon="bucket"
        title="No buckets yet"
        body="Create your first bucket to start uploading files."
      />
    );
  }

  return (
    <>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        <div className="ks-search">
          <Icon name="search" size={14} />
          <input
            placeholder="Filter buckets"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="ks-table">
        <div className="ks-thead">
          <div style={{ flex: "2 1 0" }}>Name</div>
          <div style={{ flex: "1 1 0" }}>Visibility</div>
          <div style={{ flex: "1 1 0" }}>API access</div>
          <div style={{ flex: "1 1 0" }}>Objects</div>
          <div style={{ flex: "1 1 0" }}>Storage</div>
          <div style={{ flex: "1 1 0" }}>Created</div>
        </div>
        {filtered.length === 0 ? (
          <div className="ks-trow" style={{ cursor: "default" }}>
            <div className="muted" style={{ flex: 1 }}>No buckets match “{filter}”.</div>
          </div>
        ) : (
          filtered.map((b) => (
            <Link key={b.id} href={`/buckets/${b.id}`} className="ks-trow" style={{ textDecoration: "none" }}>
              <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Icon name="bucket" size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                <span style={{ fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.name}
                </span>
                {b.knowledge_enabled ? (
                  <span
                    className="ks-knowledge-chip"
                    title="Knowledge indexing on — searchable by agents"
                    aria-label="Knowledge indexing on"
                  >
                    <Icon name="search" size={14} />
                    Knowledge
                  </span>
                ) : null}
              </div>
              <div style={{ flex: "1 1 0" }}>
                <Pill tone={b.encryption_mode === "private" ? "neutral" : "info"}>
                  {b.encryption_mode === "private" ? "Private" : "Public"}
                </Pill>
              </div>
              <div style={{ flex: "1 1 0" }}>
                <Pill tone={b.api_access_granted ? "success" : "error"} dot>
                  {b.api_access_granted ? "Granted" : "Revoked"}
                </Pill>
              </div>
              <div
                style={{
                  flex: "1 1 0",
                  color: "var(--text-secondary)",
                  fontFeatureSettings: '"tnum" 1',
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {b.object_count !== undefined ? b.object_count.toLocaleString() : "—"}
              </div>
              <div
                style={{
                  flex: "1 1 0",
                  color: "var(--text-secondary)",
                  fontFeatureSettings: '"tnum" 1',
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {b.size_bytes_total !== undefined
                  ? formatBytes(b.size_bytes_total)
                  : "—"}
              </div>
              <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>
                {formatRelative(b.created_at)}
              </div>
            </Link>
          ))
        )}
      </div>

      {hasNextPage ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchNextPage()}
            loading={isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}
