"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { BucketSettingsDrawer } from "@/components/buckets/BucketSettingsDrawer";
import { BucketTabs } from "@/components/buckets/BucketTabs";
import { FileBrowser } from "@/components/buckets/FileBrowser";
import { OwnershipCard } from "@/components/buckets/OwnershipCard";
import { Uploader } from "@/components/buckets/Uploader";
import { Topbar } from "@/components/shell/Topbar";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useBucket } from "@/lib/queries";

export default function BucketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading, error } = useBucket(id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefix, setPrefix] = useState("");

  const onUploadClick = () => {
    // The Uploader registers a global handle when it mounts; calling
    // it opens the hidden file picker. Avoids prop-drilling a ref
    // through the layout.
    window.__kraterionOpenUploader?.();
  };

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
            <Button
              variant="cta"
              icon="upload"
              onClick={onUploadClick}
              disabled={!b.api_access_granted}
              title={b.api_access_granted ? undefined : "API access is revoked — restore it from Settings."}
            >
              Upload
            </Button>
            <Button
              variant="secondary"
              icon="settings"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </Button>
            <SignOutButton />
          </>
        }
      />
      <Uploader bucket={b} prefix={prefix}>
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
              {b.object_count !== undefined ? (
                <>
                  <span style={{ color: "var(--text-tertiary)" }}>·</span>
                  <span
                    style={{
                      fontFeatureSettings: '"tnum" 1',
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {b.object_count.toLocaleString()} object
                    {b.object_count === 1 ? "" : "s"}
                    {b.size_bytes_total !== undefined
                      ? ` · ${formatBytes(b.size_bytes_total)}`
                      : ""}
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <OwnershipCard bucket={b} />

        <BucketTabs bucketId={b.id} active="files" />

        {!b.api_access_granted ? (
          <div style={{ marginBottom: 16 }}>
            <Banner
              tone="warning"
              title="API access is revoked"
              body="SDK requests against this bucket fail with KeyAccessRevoked. Uploads and downloads from the dashboard are blocked too — click Settings → Restore API access to re-grant via a sponsored on-chain transaction."
            />
          </div>
        ) : null}

        <FileBrowser bucket={b} prefix={prefix} onPrefixChange={setPrefix} />
      </main>
      </Uploader>

      <BucketSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        bucket={b}
      />
    </>
  );
}
