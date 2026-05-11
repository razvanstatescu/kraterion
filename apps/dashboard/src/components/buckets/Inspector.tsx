"use client";

import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { OnchainRef } from "@/components/ui/OnchainRef";
import { Pill } from "@/components/ui/Pill";
import { env } from "@/lib/env";
import { formatBytes, formatRelative, suiscanObjectUrl, walruscanUrl } from "@/lib/format";
import { iconForContentType } from "@/lib/objects-tree";
import type { S3ObjectJson } from "@/lib/api";

interface Props {
  object: S3ObjectJson;
  bucketName: string;
  encryptionMode: "private" | "public-read";
}

/**
 * Right-pane object inspector. Surfaces the on-chain identifiers behind
 * each file so the demo's "this is owned on-chain" claim is visible.
 *
 * Download / Delete are stubbed — they light up in Phase E once the CP
 * presigned-URL endpoints land.
 */
export function Inspector({ object, bucketName, encryptionMode }: Props) {
  const iconName = iconForContentType(object.content_type);
  const network = env.network;

  return (
    <aside className="ks-inspector">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div className="ks-file-preview">
          <Icon name={iconName} size={20} style={{ color: "var(--text-secondary)" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 14, wordBreak: "break-all" }}>
            {object.s3_key.split("/").pop() || object.s3_key}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
            {formatBytes(object.size_bytes)} · {formatRelative(object.uploaded_at)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 24 }}>
        <Detail label="Full key">
          <div className="ks-codeline mono">
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {bucketName}/{object.s3_key}
            </span>
            <Icon name="copy" size={14} />
          </div>
        </Detail>

        <Detail label="Content type">
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {object.content_type ?? "application/octet-stream"}
          </span>
        </Detail>

        <Detail label="ETag (MD5)">
          <span className="ks-onchain-mono" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {object.etag}
          </span>
        </Detail>

        <Detail label="Visibility">
          <Pill tone={encryptionMode === "private" ? "neutral" : "info"}>
            {encryptionMode === "private" ? "Private" : "Public"}
          </Pill>
        </Detail>
      </div>

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div className="micro" style={{ marginBottom: 12 }}>On-chain</div>
        <OnchainRef
          label="Walrus blob"
          value={object.walrus_blob_id}
          href={walruscanUrl(object.walrus_blob_id)}
        />
        <OnchainRef
          label="Sui object"
          value={object.shared_blob_object_id}
          href={suiscanObjectUrl(object.shared_blob_object_id, network)}
        />
        <OnchainRef
          label="Storage until"
          value={`Epoch ${object.storage_end_epoch}`}
        />
        <OnchainRef
          label="Seal identity"
          value={object.seal_identity_b64}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Button variant="secondary" size="sm" icon="download" disabled title="Phase E">
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          disabled
          title="Phase E"
          style={{ marginLeft: "auto", color: "var(--error)" }}
        >
          Delete
        </Button>
      </div>
    </aside>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="micro" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
