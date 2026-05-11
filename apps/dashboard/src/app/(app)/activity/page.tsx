"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ControlPlaneError, type BucketJson } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { useBuckets } from "@/lib/queries";
import { formatRelative } from "@/lib/format";

interface Event {
  id: string;
  kind: "bucket_created" | "bucket_deleted";
  at: string;
  bucket: BucketJson;
}

/**
 * Reverse-chronological feed of bucket-level events. Pulls
 * `useBuckets({ includeDeleted: true })` and synthesizes one row per
 * bucket creation and one per soft-delete.
 *
 * Object-level uploads are intentionally not in the feed (yet) — to do
 * that across all buckets we'd need an account-scoped /v1/activity
 * endpoint; for the demo the per-bucket file browser is the place to
 * see uploads.
 */
export default function ActivityPage() {
  useMe();
  const { data, isLoading, error } = useBuckets({ includeDeleted: true, limit: 100 });

  const events: Event[] = useMemo(() => {
    if (!data) return [];
    const all = data.pages.flatMap((p) => p.buckets);
    const out: Event[] = [];
    for (const b of all) {
      out.push({ id: `c-${b.id}`, kind: "bucket_created", at: b.created_at, bucket: b });
      if (b.deleted_at) {
        out.push({ id: `d-${b.id}`, kind: "bucket_deleted", at: b.deleted_at, bucket: b });
      }
    }
    out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return out;
  }, [data]);

  return (
    <>
      <Topbar crumbs={[{ label: "Activity" }]} />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1>Activity</h1>
            <p className="lead">
              Bucket-level events for your account. The indexer writes these from on-chain Move
              events the moment they settle.
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
            body="Create a bucket on the buckets page to start a timeline."
          />
        ) : (
          <div className="ks-activity-list">
            {events.map((e) => (
              <Row key={e.id} event={e} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function Row({ event }: { event: Event }) {
  const icon: IconName = event.kind === "bucket_deleted" ? "trash" : "folder";
  const verb = event.kind === "bucket_deleted" ? "Bucket deleted" : "Bucket created";
  return (
    <div className="ks-activity-row">
      <div className="ks-activity-icon">
        <Icon name={icon} size={16} />
      </div>
      <div className="ks-activity-text">
        <div className="ks-activity-title">
          {verb}:{" "}
          <Link
            href={`/buckets/${event.bucket.id}`}
            style={{ color: "var(--text-primary)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            {event.bucket.name}
          </Link>
        </div>
        <div className="ks-activity-sub">
          {event.bucket.encryption_mode === "private" ? "Private" : "Public-read"} ·{" "}
          {event.bucket.region}
        </div>
      </div>
      <div className="ks-activity-meta">{formatRelative(event.at)}</div>
    </div>
  );
}
