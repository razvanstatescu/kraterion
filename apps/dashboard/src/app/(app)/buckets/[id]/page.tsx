"use client";

import { useParams } from "next/navigation";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { FileBrowser } from "@/components/buckets/FileBrowser";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError } from "@/lib/api";
import { formatWal } from "@/lib/format";
import { useBucket } from "@/lib/queries";

export default function BucketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading, error } = useBucket(id);

  if (error) {
    const message =
      error instanceof ControlPlaneError && error.code === "NotFound"
        ? "This bucket doesn't exist or you don't have access to it."
        : error instanceof ControlPlaneError
          ? error.message
          : "Couldn't load this bucket.";
    return (
      <>
        <Topbar crumbs={[{ label: "Buckets", href: "/buckets" }, { label: "—" }]} actions={<SignOutButton />} />
        <main className="ks-screen">
          <Banner tone="error" title="Bucket not found" body={message} />
        </main>
      </>
    );
  }

  if (isLoading || !data) {
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
        crumbs={[{ label: "Buckets", href: "/buckets" }, { label: b.name }]}
        actions={
          <>
            <Button variant="cta" icon="upload" disabled title="Phase E">
              Upload
            </Button>
            <Button variant="secondary" icon="settings" disabled title="Phase D">
              Settings
            </Button>
            <SignOutButton />
          </>
        }
      />
      <main className="ks-screen">
        <div className="ks-screen-head">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
              <Icon name="bucket" size={20} style={{ color: "var(--text-secondary)" }} />
              {b.name}
            </h1>
            <p className="lead" style={{ fontSize: 14, marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>{b.region}</span>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <Pill tone={b.encryption_mode === "private" ? "neutral" : "info"}>
                {b.encryption_mode === "private" ? "Private" : "Public"}
              </Pill>
              <Pill tone={b.api_access_granted ? "success" : "error"} dot>
                {b.api_access_granted ? "API access granted" : "API access revoked"}
              </Pill>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span>Funding {formatWal(b.funding_pool_wal)}</span>
            </p>
          </div>
        </div>

        {!b.api_access_granted ? (
          <div style={{ marginBottom: 16 }}>
            <Banner
              tone="warning"
              title="API access is revoked"
              body="SDK requests against this bucket fail with KeyAccessRevoked. Re-granting lights up in Phase D."
            />
          </div>
        ) : null}

        <FileBrowser bucket={b} />
      </main>
    </>
  );
}
