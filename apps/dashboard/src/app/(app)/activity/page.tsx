"use client";

import Link from "next/link";
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
 * Surfaces four kinds today:
 *   - `bucket_created` / `bucket_deleted`
 *   - `object_uploaded` / `object_deleted`
 *
 * On-chain origin events (bucket-create, object-upload) carry a
 * `tx_digest` so the row links straight to Suiscan for the demo's
 * "everything is on-chain" beat.
 */
export default function ActivityPage() {
  const { data, isLoading, error } = useActivity({ limit: 100 });

  const events = data?.events ?? [];

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

function Row({ event }: { event: ActivityEventJson }) {
  const { icon, verb, accent } = describe(event);
  const filename = event.object ? leaf(event.object.s3_key) : null;

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
  }
}

function leaf(key: string): string {
  const parts = key.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? key;
}
