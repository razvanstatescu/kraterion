"use client";

import { useState } from "react";
import { useCurrentAccount, useSignPersonalMessage, useSuiClient } from "@mysten/dapp-kit";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Icon, type IconName } from "@/components/ui/Icon";
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
  /** Fired after a successful delete so the parent can close the drawer
   *  (the underlying object is gone — keeping the inspector open would
   *  surface stale state until the next refresh). */
  onDeleted?: () => void;
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
export function Inspector({ object, bucket, onDeleted }: Props) {
  const network = env.network;
  const { show } = useToast();
  const prepareDownload = usePrepareDownload();
  const prepareDelete = usePrepareDelete();
  const prepareShareLink = usePrepareShareLink();
  const invalidate = useInvalidateBucketObjects();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

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
      // Close the inspector — the object is gone; staying open would
      // render stale state until the next list refresh lands.
      onDeleted?.();
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

  const contentType = object.content_type ?? "application/octet-stream";
  const typeIcon = iconForContentType(object.content_type);
  const accessIcon = encryptionMode === "private" ? "lock" : "unlock";

  // Unified Get URL action — public bucket gives a permanent URL,
  // private gives a 5-minute SigV4 signature. Dispatch by visibility.
  const isPublic = encryptionMode === "public-read";
  const linkDisabled = !isPublic && (!apiAccessGranted || prepareShareLink.isPending);
  const linkBusy = !isPublic && prepareShareLink.isPending;
  const onGetUrl = async () => {
    try {
      let resolved: string;
      if (isPublic) {
        resolved = `${window.location.origin}/public/${encodeURIComponent(bucketName)}/${object.s3_key
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/")}`;
      } else {
        const signed = await prepareShareLink.mutateAsync(object.id);
        resolved = signed.url;
      }
      await navigator.clipboard.writeText(resolved);
      setLinkUrl(resolved);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't get a URL for this file.";
      show({ tone: "error", title: "Couldn't generate URL", body: message });
    }
  };
  const linkLabel = linkUrl
    ? linkCopied
      ? "Copied"
      : isPublic
        ? "Copy URL"
        : "Renew & copy"
    : linkBusy
      ? "Generating…"
      : "Get URL";

  return (
    <div className="ks-inspector-body">
      {/* Identifier — the bucket-relative key, prominent at the top
          as the most-copied value. S3 URI dropped (constructible from
          bucket name in the breadcrumb + this key). */}
      <section className="ks-inspector-section">
        <Detail label="Key">
          <CopyableMono value={object.s3_key} ariaLabel="Copy key" />
        </Detail>
      </section>

      {/* Metadata — each fact gets a Lucide icon, a sentence-case
          label, and its value. Reads as a stat list rather than a
          dense table; the icons anchor each row visually so the eye
          can jump straight to the property it needs (clock for
          modified, lock for access, etc.). Sentence-case labels per
          the design system's casing rule (uppercase reserved for
          11px micro labels above sections; here we're at 13px). */}
      <section className="ks-inspector-section">
        <dl className="ks-inspector-stats">
          <StatRow icon="database" label="Size" value={formatBytes(object.size_bytes)} />
          <StatRow icon={typeIcon} label="Type" value={contentType} mono />
          <StatRow
            icon={accessIcon}
            label="Access"
            value={
              <Pill tone={encryptionMode === "private" ? "neutral" : "info"}>
                {encryptionMode === "private" ? "Private" : "Public"}
              </Pill>
            }
          />
          <StatRow icon="clock" label="Modified" value={formatRelative(object.uploaded_at)} />
          <StatRow icon="hash" label="ETag" value={object.etag} mono />
          {object.metadata
            ? Object.entries(object.metadata).map(([k, v]) => (
                <StatRow key={k} icon="info" label={k} value={v} />
              ))
            : null}
        </dl>
      </section>

      {/* Primary actions — Get URL and Download as twin secondary
          buttons. Same variant + size so they read as peers; the
          paired layout makes "what can I do with this file?" obvious
          at a glance. Delete is intentionally absent here — destructive
          actions live in their own section below the on-chain
          disclosure, away from everyday clicks. */}
      <section className="ks-inspector-section">
        <div className="ks-inspector-actions">
          <Button
            variant="secondary"
            size="sm"
            icon={linkCopied ? "check" : "link"}
            onClick={() => void onGetUrl()}
            disabled={linkDisabled}
            loading={linkBusy}
            title={
              linkDisabled
                ? "API access is revoked — restore it to mint share links."
                : undefined
            }
          >
            {linkLabel}
          </Button>
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
        </div>
        {linkUrl ? (
          <div className="ks-codeline" onClick={() => void onGetUrl()}>
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-jetbrains-mono), ui-monospace, Menlo, monospace",
                fontSize: 12,
                color: "var(--text-secondary)",
              }}
              title={linkUrl}
            >
              {linkUrl}
            </span>
            <Icon name="copy" size={14} />
          </div>
        ) : null}
        <div className="ks-field-helper">
          {isPublic
            ? "Permanent link. Anyone with the URL can view the file."
            : "Signed for 5 minutes. Revoking API access invalidates outstanding links immediately."}
        </div>
        {useBrowserDecrypt ? (
          <div
            className="ks-field-helper"
            title="Ciphertext is fetched directly from Walrus; the gateway never sees plaintext."
          >
            Downloads decrypt in your browser — survives platform revoke.
          </div>
        ) : null}
      </section>

      <OnchainDisclosure
        walrusBlobId={object.walrus_blob_id}
        pooledBlobObjectId={object.pooled_blob_object_id}
        sealIdentityB64={object.seal_identity_b64}
        network={network}
      />

      {/* Delete sits alone in a destructive-action zone below the
          on-chain disclosure. The visual distance + the red text
          marks it as different from the everyday Get URL / Download
          twins above. */}
      <section className="ks-inspector-section ks-inspector-danger">
        <Button
          variant="ghost"
          size="sm"
          icon="trash"
          onClick={() => setConfirmDelete(true)}
          disabled={!apiAccessGranted || deleting}
          title={apiAccessGranted ? undefined : "API access is revoked."}
          style={{ color: "var(--error)" }}
        >
          Delete file
        </Button>
      </section>
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
    </div>
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
  pooledBlobObjectId,
  sealIdentityB64,
  network,
}: {
  walrusBlobId: string;
  pooledBlobObjectId: string | null;
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
          {pooledBlobObjectId ? (
            <OnchainRef
              label="Sui object"
              value={pooledBlobObjectId}
              href={suiscanObjectUrl(pooledBlobObjectId, network)}
            />
          ) : (
            <OnchainRef label="Sui object" value="(pending indexer)" />
          )}
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
 * Unified share-URL affordance. Replaces what used to be two distinct
 * components (`PublicUrl` for permanent links to public-read files,
 * `ShareLink` for 5-minute SigV4-signed links to private files). The
 * user-visible action is the same in both cases — "get me a URL I can
 * paste somewhere" — so the dashboard collapses them into one button
 * and dispatches by bucket visibility internally.
 *
 * Semantics surface in the helper text below the link:
 *   - **Public bucket** → permanent dashboard URL (server-side redirects
 *     to the gateway's public route). Anyone with the link can read.
 *   - **Private bucket** → 5-minute SigV4 query-string URL minted via
 *     `usePrepareShareLink`. Bound to the bucket's API access — flipping
 *     `revoke_all_api_access` invalidates outstanding links instantly.
 *
 * Click → generates if needed → copies to clipboard → reveals the
 * resolved URL inline. Subsequent clicks re-copy (for private buckets,
 * mint a fresh signature).
 */
/**
 * One row in the inspector's metadata stat list. Renders as:
 *
 *   [icon]  Label    Value
 *
 * Icon is a 16 px Lucide glyph in `--text-tertiary`; label is
 * sentence-case at 13 px tertiary; value is 13 px primary (or mono
 * when the value is a technical identifier like an ETag or a long
 * MIME type — `mono` prop opts into that treatment).
 */
function StatRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: IconName;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="ks-stat-row">
      <Icon name={icon} size={14} className="ks-stat-icon" />
      <span className="ks-stat-label">{label}</span>
      <span
        className={`ks-stat-value${mono ? " ks-stat-value-mono" : ""}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
