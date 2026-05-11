"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Icon } from "@/components/ui/Icon";
import { OnchainRef } from "@/components/ui/OnchainRef";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { env } from "@/lib/env";
import { formatBytes, formatRelative, suiscanObjectUrl, walruscanUrl } from "@/lib/format";
import {
  deleteSigned,
  downloadToDisk,
  useInvalidateBucketObjects,
  usePrepareDelete,
  usePrepareDownload,
} from "@/lib/objects";
import { iconForContentType } from "@/lib/objects-tree";
import type { S3ObjectJson } from "@/lib/api";

interface Props {
  object: S3ObjectJson;
  bucketName: string;
  bucketId: string;
  encryptionMode: "private" | "public-read";
  apiAccessGranted: boolean;
}

/**
 * Right-pane object inspector. Surfaces the on-chain identifiers behind
 * each file so the demo's "this is owned on-chain" claim is visible.
 *
 * Download / Delete go through the CP-signed envelope. Both are
 * disabled when `api_access_granted` is false — the gateway rejects
 * those requests anyway, so this is a friendlier-than-an-error gate.
 */
export function Inspector({
  object,
  bucketName,
  bucketId,
  encryptionMode,
  apiAccessGranted,
}: Props) {
  const iconName = iconForContentType(object.content_type);
  const network = env.network;
  const { show } = useToast();
  const prepareDownload = usePrepareDownload();
  const prepareDelete = usePrepareDelete();
  const invalidate = useInvalidateBucketObjects();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filename = object.s3_key.split("/").pop() || object.s3_key;

  const onDownload = async () => {
    setDownloading(true);
    try {
      const signed = await prepareDownload.mutateAsync(object.id);
      await downloadToDisk(signed, filename);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Download failed.";
      show({ tone: "error", title: "Download failed", body: message });
    } finally {
      setDownloading(false);
    }
  };

  const onDelete = async () => {
    setDeleting(true);
    try {
      const signed = await prepareDelete.mutateAsync(object.id);
      await deleteSigned(signed);
      invalidate(bucketId);
      setConfirmDelete(false);
      show({ tone: "success", title: `Deleted ${filename}`, body: "The on-chain SharedBlob persists — only the dashboard row is marked deleted." });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Delete failed.";
      show({ tone: "error", title: "Delete failed", body: message });
    } finally {
      setDeleting(false);
    }
  };

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
        <Button
          variant="secondary"
          size="sm"
          icon="download"
          onClick={onDownload}
          loading={downloading}
          disabled={!apiAccessGranted}
          title={apiAccessGranted ? undefined : "API access is revoked."}
        >
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          onClick={() => setConfirmDelete(true)}
          disabled={!apiAccessGranted || deleting}
          title={apiAccessGranted ? undefined : "API access is revoked."}
          style={{ marginLeft: "auto", color: "var(--error)" }}
        >
          Delete
        </Button>
      </div>
      <ConfirmModal
        open={confirmDelete}
        onCancel={() => (deleting ? undefined : setConfirmDelete(false))}
        onConfirm={onDelete}
        busy={deleting}
        danger
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        title={`Delete ${filename}?`}
        body={
          <>
            <p>
              Removes the row from this bucket. The on-chain SharedBlob persists
              regardless &mdash; that&apos;s the whole point. You can refund and
              re-list it from the CLI if needed.
            </p>
          </>
        }
        onchainNote="Files remain encrypted on-chain at your Sui address."
      />
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
