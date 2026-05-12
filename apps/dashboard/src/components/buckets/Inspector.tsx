"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount, useSignPersonalMessage, useSuiClient } from "@mysten/dapp-kit";
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
  downloadPrivateInBrowser,
  downloadToDisk,
  useInvalidateBucketObjects,
  usePrepareDelete,
  usePrepareDownload,
  usePrepareShareLink,
} from "@/lib/objects";
import { iconForContentType } from "@/lib/objects-tree";
import type { BucketJson, S3ObjectJson } from "@/lib/api";

interface Props {
  object: S3ObjectJson;
  bucket: BucketJson;
}

/**
 * Right-pane object inspector. Surfaces the on-chain identifiers behind
 * each file so the demo's "this is owned on-chain" claim is visible.
 *
 * Download paths split on `encryption_mode`:
 *   - **public-read** → gateway-signed envelope. The gateway decrypts
 *     using its own sub-wallet's Seal SessionKey; fine because the bucket
 *     is open.
 *   - **private** → browser-side Seal decrypt. Ciphertext comes from the
 *     public Walrus aggregator, decryption happens locally via a
 *     SessionKey the user signs through zkLogin. The gateway is bypassed
 *     entirely — so the download keeps working after the user revokes
 *     platform API access. That's the demo's headline.
 *
 * Delete still uses the CP-signed gateway path: after revocation the
 * platform can't delete on the user's behalf either, which is the
 * correct outcome.
 */
export function Inspector({ object, bucket }: Props) {
  const iconName = iconForContentType(object.content_type);
  const network = env.network;
  const { show } = useToast();
  const prepareDownload = usePrepareDownload();
  const prepareDelete = usePrepareDelete();
  const invalidate = useInvalidateBucketObjects();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const bucketName = bucket.name;
  const bucketId = bucket.id;
  const encryptionMode = bucket.encryption_mode;
  const apiAccessGranted = bucket.api_access_granted;

  // Browser-decrypt path dependencies. `useCurrentAccount()` is the
  // signed-in Sui address (the bucket owner during normal use); the
  // `signPersonalMessage` mutation pipes through Enoki's zkLogin signer.
  const suiClient = useSuiClient();
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();

  const filename = object.s3_key.split("/").pop() || object.s3_key;
  // Browser decrypt requires the wallet to be connected (we need the
  // user's address to seed the SessionKey + the signer to sign it).
  // Without it we can't run the private path at all.
  const browserDecryptReady = encryptionMode === "private" && Boolean(currentAccount);
  // Gateway path is the fallback (public-read) or the only path when the
  // wallet isn't connected. It's blocked by api_access_granted.
  const useBrowserDecrypt = encryptionMode === "private" && browserDecryptReady;
  const downloadDisabled = useBrowserDecrypt
    ? !browserDecryptReady
    : !apiAccessGranted;
  const downloadTooltip = useBrowserDecrypt
    ? browserDecryptReady
      ? undefined
      : "Sign in with a wallet to decrypt this file in your browser."
    : apiAccessGranted
      ? undefined
      : "API access is revoked.";

  const onDownload = async () => {
    setDownloading(true);
    try {
      if (useBrowserDecrypt && currentAccount) {
        await downloadPrivateInBrowser({
          suiClient,
          accountAddress: currentAccount.address,
          signPersonalMessage: async (msg) => signPersonalMessage({ message: msg }),
          object,
          bucket,
          filename,
        });
      } else {
        const signed = await prepareDownload.mutateAsync(object.id);
        await downloadToDisk(signed, filename);
      }
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
        <Detail label="Key">
          <CopyableMono value={object.s3_key} ariaLabel="Copy key" />
        </Detail>

        <Detail label="S3 URI">
          <CopyableMono value={`s3://${bucketName}/${object.s3_key}`} ariaLabel="Copy S3 URI" />
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

        {encryptionMode === "public-read" ? (
          <Detail label="Public URL">
            <PublicUrl bucketName={bucketName} s3Key={object.s3_key} />
          </Detail>
        ) : null}

        <Detail label="Share link">
          <ShareLink objectId={object.id} apiAccessGranted={apiAccessGranted} />
        </Detail>

        {object.metadata ? (
          <Detail label="Metadata">
            <MetadataList metadata={object.metadata} />
          </Detail>
        ) : null}
      </div>

      <OnchainDisclosure
        walrusBlobId={object.walrus_blob_id}
        sharedBlobObjectId={object.shared_blob_object_id}
        sealIdentityB64={object.seal_identity_b64}
        network={network}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
        <Button
          variant="secondary"
          size="sm"
          icon="download"
          onClick={onDownload}
          loading={downloading}
          disabled={downloadDisabled}
          title={downloadTooltip}
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
      {useBrowserDecrypt ? (
        <div
          className="ks-field-helper"
          style={{ marginTop: 8, color: "var(--text-tertiary)" }}
          title="Ciphertext is fetched directly from Walrus; the gateway never sees plaintext."
        >
          Decrypts in your browser — survives platform revoke.
        </div>
      ) : null}
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

/**
 * Custom `x-amz-meta-*` headers captured at PutObject time. Rendered as
 * a compact key/value list. The CP filters to string-valued entries
 * only, so we can trust the shape.
 */
function MetadataList({ metadata }: { metadata: Record<string, string> }) {
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "grid",
        gap: 4,
        fontSize: 12,
      }}
    >
      {Object.entries(metadata).map(([k, v]) => (
        <li
          key={k}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 8,
            color: "var(--text-secondary)",
          }}
        >
          <span style={{ color: "var(--text-tertiary)" }}>{k}</span>
          <span style={{ color: "var(--text-primary)", wordBreak: "break-word" }}>{v}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "On-chain" Tier 2 disclosure on the Inspector.
 *
 * Collapsed by default so web2 users see clean file metadata without
 * hex noise. Web3 users click to reveal the Walrus + Sui references
 * (proof of ownership + provenance) plus the Seal identity that gates
 * decryption.
 *
 * Deliberately omits anything resembling chain economics — no storage
 * expiry, no funding pool. Kraterion pays Walrus rent and bills the
 * user out-of-band; those numbers belong in a future billing surface,
 * not here.
 */
function OnchainDisclosure({
  walrusBlobId,
  sharedBlobObjectId,
  sealIdentityB64,
  network,
}: {
  walrusBlobId: string;
  sharedBlobObjectId: string;
  sealIdentityB64: string;
  network: "testnet" | "mainnet" | "devnet";
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ks-inspector-onchain">
      <button
        type="button"
        className="ks-inspector-onchain-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Icon name="chevron" size={14} style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)" }} />
        <span>On-chain details</span>
        <span className="ks-inspector-onchain-hint">
          {open ? "Hide" : "Walrus blob, Sui object, Seal identity"}
        </span>
      </button>
      {open ? (
        <div className="ks-inspector-onchain-body">
          <OnchainRef
            label="Walrus blob"
            value={walrusBlobId}
            href={walruscanUrl(walrusBlobId)}
          />
          <OnchainRef
            label="Sui object"
            value={sharedBlobObjectId}
            href={suiscanObjectUrl(sharedBlobObjectId, network)}
          />
          <OnchainRef label="Seal identity" value={sealIdentityB64} />
          <p className="ks-inspector-onchain-caption">
            48-byte IBE identity Seal uses to gate decryption — bucket
            object id (32 bytes) followed by object uuid (16 bytes).
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Mono-rendered value with an inline copy button. Used for keys, URIs,
 * and anything else the user might want to paste into a terminal.
 * Shows a "Copied" hint for 1.5s after a successful click.
 */
function CopyableMono({ value, ariaLabel }: { value: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API rejects in non-secure contexts; ignore quietly.
    }
  };
  return (
    <>
      <div className="ks-codeline mono">
        <span
          style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          title={value}
        >
          {value}
        </span>
        <button
          className="icon-btn"
          onClick={() => void onCopy()}
          type="button"
          title={ariaLabel}
          aria-label={ariaLabel}
        >
          <Icon name="copy" size={14} />
        </button>
      </div>
      {copied ? (
        <div className="ks-field-helper" style={{ color: "var(--success)", marginTop: 4 }}>
          Copied
        </div>
      ) : null}
    </>
  );
}

/**
 * Shareable URL for public-read objects. Two surfaces:
 *   - The **dashboard URL** (`http://localhost:3001/public/...`) — reads
 *     nicely in messages and previews. Server-side-redirects to the
 *     gateway in `app/public/[bucket]/[...key]/page.tsx`.
 *   - A direct **gateway URL** the dashboard URL redirects to, available
 *     via a secondary copy button for power users / aws-cli folks.
 */
function PublicUrl({ bucketName, s3Key }: { bucketName: string; s3Key: string }) {
  // Use the browser's own origin so the URL is portable across
  // localhost / staging / prod without env wiring on every render.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const dashboardUrl = origin
    ? `${origin}/public/${encodeURIComponent(bucketName)}/${s3Key
        .split("/")
        .map((s) => encodeURIComponent(s))
        .join("/")}`
    : "";

  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!dashboardUrl) return;
    try {
      await navigator.clipboard.writeText(dashboardUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in non-secure contexts; ignore quietly.
    }
  };

  return (
    <>
      <div className="ks-codeline">
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
            fontSize: 12,
          }}
          title={dashboardUrl}
        >
          {dashboardUrl || "Loading…"}
        </span>
        <button
          className="icon-btn"
          onClick={() => void onCopy()}
          type="button"
          title="Copy URL"
          aria-label="Copy URL"
        >
          <Icon name="copy" size={14} />
        </button>
      </div>
      {copied ? (
        <div className="ks-field-helper" style={{ color: "var(--success)", marginTop: 4 }}>
          Copied
        </div>
      ) : (
        <div className="ks-field-helper" style={{ marginTop: 4 }}>
          Anyone with this link can view the file. Open it in any browser, paste it in a
          tweet, embed it in <code>&lt;img src&gt;</code>.
        </div>
      )}
    </>
  );
}

/**
 * Generate-then-copy affordance for query-string SigV4 share links.
 *
 * Two-step UX rather than a typed URL field: the link contains a fresh
 * SigV4 signature that's only valid for 5 minutes, so showing a
 * pre-generated value would be misleading. The user clicks once to
 * mint, the dashboard copies it straight to the clipboard, and a small
 * helper line confirms the 5-min window.
 */
function ShareLink({ objectId, apiAccessGranted }: { objectId: string; apiAccessGranted: boolean }) {
  const prepare = usePrepareShareLink();
  const [copied, setCopied] = useState(false);
  const { show } = useToast();

  const onGenerate = async () => {
    if (!apiAccessGranted) return;
    try {
      const signed = await prepare.mutateAsync(objectId);
      await navigator.clipboard.writeText(signed.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create share link.";
      show({ tone: "error", title: "Share link failed", body: message });
    }
  };

  return (
    <>
      <div className="ks-codeline" style={{ alignItems: "center" }}>
        <span style={{ flex: 1, fontSize: 12, color: "var(--text-tertiary)" }}>
          {copied
            ? "Copied to clipboard — expires in 5 minutes"
            : "Click to generate a 5-minute shareable URL"}
        </span>
        <button
          className="icon-btn"
          onClick={() => void onGenerate()}
          type="button"
          title={apiAccessGranted ? "Generate and copy" : "API access is revoked."}
          aria-label="Generate share link"
          disabled={!apiAccessGranted || prepare.isPending}
        >
          <Icon name={copied ? "info" : "link"} size={14} />
        </button>
      </div>
      <div className="ks-field-helper" style={{ marginTop: 4 }}>
        Works with anything that takes a URL — <code>curl</code>, <code>&lt;img src&gt;</code>,
        Slack. Revoking API access invalidates outstanding links immediately.
      </div>
    </>
  );
}
