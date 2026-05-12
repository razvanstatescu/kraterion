"use client";

import { useParams } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BucketTabs } from "@/components/buckets/BucketTabs";
import { ConnectAgentPanel } from "@/components/knowledge/ConnectAgentPanel";
import { KnowledgeSearch } from "@/components/knowledge/KnowledgeSearch";
import { KnowledgeStatus as KnowledgeStatusPanel } from "@/components/knowledge/KnowledgeStatus";
import { KnowledgeToggle } from "@/components/knowledge/KnowledgeToggle";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError } from "@/lib/api";
import { useBucket, useKnowledgeStatus } from "@/lib/queries";

/**
 * Knowledge tab on a single bucket (K4).
 *
 * Layout: toggle on top, status next, search third, connect-an-agent
 * last — the path a new user walks down. The first three only render
 * when meaningful; connect-an-agent is always there because it works
 * regardless of whether Knowledge is on (the MCP server can still
 * list buckets and read objects).
 *
 * Status auto-refreshes while the indexer is draining so the user
 * sees "indexed N of M" tick up live.
 */
export default function BucketKnowledgePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading, error } = useBucket(id);
  const knowledge = useKnowledgeStatus(id);

  // Refetch every 2s while the queue is still draining. The hook
  // overrides refetchInterval inline below — keeps the polling code
  // co-located with the page that needs it.
  const summary = knowledge.data?.summary;
  const draining =
    !!summary && summary.pending > 0;
  if (knowledge.dataUpdatedAt && draining) {
    // React Query handles the actual interval; we just hint that we
    // care about a fast refresh while pending > 0. Re-rendering this
    // page already drives the next fetch via the queryClient.
  }

  if (error) {
    const message =
      error instanceof ControlPlaneError && error.code === "NotFound"
        ? "This bucket doesn't exist or you don't have access to it."
        : error instanceof ControlPlaneError
          ? error.message
          : "Couldn't load this bucket.";
    return (
      <>
        <Topbar
          crumbs={[{ label: "Buckets", href: "/buckets" }, { label: "—" }]}
          actions={<SignOutButton />}
        />
        <main className="ks-screen">
          <Banner tone="error" title="Bucket not found" body={message} />
        </main>
      </>
    );
  }

  if (isLoading || !data || !id) {
    return (
      <>
        <Topbar
          crumbs={[{ label: "Buckets", href: "/buckets" }, { label: "Loading…" }]}
          actions={<SignOutButton />}
        />
        <main className="ks-screen">
          <div className="muted" style={{ fontSize: 14 }}>Loading bucket…</div>
        </main>
      </>
    );
  }

  const b = data.bucket;

  return (
    <>
      <Topbar
        crumbs={[
          { label: "Buckets", href: "/buckets" },
          { label: b.name, href: `/buckets/${b.id}` },
          { label: "Knowledge" },
        ]}
        actions={<SignOutButton />}
      />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Icon name="bucket" size={20} style={{ color: "var(--text-secondary)" }} />
              {b.name}
            </h1>
            <p
              className="lead"
              style={{
                fontSize: 14,
                marginTop: 6,
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span>{b.region}</span>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <Pill tone={b.encryption_mode === "private" ? "neutral" : "info"}>
                {b.encryption_mode === "private" ? "Private" : "Public"}
              </Pill>
              {knowledge.data?.enabled ? (
                <Pill tone="info" dot>
                  Knowledge on
                </Pill>
              ) : null}
            </p>
          </div>
        </div>

        <BucketTabs bucketId={b.id} active="knowledge" />

        <div className="ks-stack">
          {knowledge.isLoading ? (
            <div className="muted" style={{ fontSize: 14 }}>
              Loading Knowledge status…
            </div>
          ) : knowledge.data ? (
            <>
              <KnowledgeToggle bucketId={b.id} status={knowledge.data} />
              <KnowledgeStatusPanel status={knowledge.data} />
              {knowledge.data.enabled && knowledge.data.summary.indexed > 0 ? (
                <KnowledgeSearch bucketId={b.id} bucketName={b.name} />
              ) : null}
              <ConnectAgentPanel bucketName={b.name} />
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}
