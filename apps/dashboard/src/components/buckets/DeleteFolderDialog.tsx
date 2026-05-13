"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { useFolderPreview, usePurgeFolder } from "@/lib/queries";

interface Props {
  open: boolean;
  bucketId: string;
  /** Full folder prefix, always ends with "/". */
  prefix: string;
  onCancel: () => void;
  /** Called after a successful purge. The caller decides whether to
   *  navigate back to the parent prefix. */
  onPurged: (counts: { objects_deleted: number; markers_deleted: number }) => void;
}

const CONFIRM_WORD = "delete";

/**
 * Recursive folder-delete confirmation modal.
 *
 * UX:
 *   - Opens with a preview fetch: how many live objects sit under the
 *     prefix, plus any marker rows (including nested empty folders).
 *   - Empty folder → one-click confirm.
 *   - Non-empty folder → user MUST type "delete" verbatim (mirrors the
 *     classic GitHub repo-delete affordance). The "always require" rule
 *     comes straight from the user's spec.
 *
 * Honest disclosure (banner copy): on-chain SharedBlobs persist with
 * their funding pools — this only clears the dashboard view. Funding
 * eventually times out and the blobs are reaper-eligible; we don't
 * promise an instant on-chain wipe.
 */
export function DeleteFolderDialog({ open, bucketId, prefix, onCancel, onPurged }: Props) {
  const preview = useFolderPreview(bucketId, open ? prefix : undefined);
  const purge = usePurgeFolder(bucketId);
  const { show } = useToast();

  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, submitting]);

  const folderName = deriveFolderName(prefix);
  const objCount = preview.data?.object_count ?? 0;
  const markerCount = preview.data?.marker_count ?? 0;
  const isEmpty = preview.data?.object_count === 0;
  const previewLoading = preview.isLoading;

  const typedOk = typed === CONFIRM_WORD;
  const canSubmit = !previewLoading && !submitting && (isEmpty || typedOk);

  const onConfirm = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await purge.mutateAsync(prefix);
      show({
        tone: "success",
        title: `Folder "${folderName}" deleted`,
        body:
          res.objects_deleted > 0
            ? `${res.objects_deleted} ${res.objects_deleted === 1 ? "object" : "objects"} soft-deleted. On-chain SharedBlobs persist.`
            : "The empty folder marker was removed.",
        sticky: true,
      });
      onPurged(res);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not delete folder.";
      show({ tone: "error", title: "Couldn't delete folder", body: message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  return (
    <Portal>
    <div className="ks-modal-scrim" onClick={submitting ? undefined : onCancel} role="dialog" aria-modal="true">
      <div className="ks-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ks-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ks-deletefolder-glyph" aria-hidden="true">
              <Icon name="trash" size={16} />
            </span>
            <div style={{ fontSize: 18, fontWeight: 500 }}>Delete folder</div>
          </div>
          <IconButton name="x" label="Cancel" onClick={onCancel} disabled={submitting} />
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="ks-newfolder-parent">
            <span className="micro">Path</span>
            <span className="ks-newfolder-parent-path" title={prefix}>
              {prefix}
            </span>
          </div>

          {previewLoading ? (
            <div className="muted" style={{ fontSize: 13 }}>Counting contents…</div>
          ) : preview.error ? (
            <div className="ks-field-error">Couldn&apos;t load contents preview.</div>
          ) : isEmpty ? (
            <div className="ks-deletefolder-summary">
              This folder is empty. Removing the marker hides it from the browser.
            </div>
          ) : (
            <>
              <div className="ks-deletefolder-summary">
                Removes <strong>{objCount}</strong>{" "}
                {objCount === 1 ? "object" : "objects"}
                {markerCount > 1
                  ? ` and ${markerCount - 1} nested ${markerCount - 1 === 1 ? "subfolder" : "subfolders"}`
                  : ""}{" "}
                from this bucket&apos;s view.
              </div>

              <div className="ks-field">
                <label className="ks-field-label" htmlFor="folder-delete-confirm">
                  Type{" "}
                  <code className="ks-deletefolder-keyword">{CONFIRM_WORD}</code>{" "}
                  to confirm<span className="ks-field-req">*</span>
                </label>
                <input
                  id="folder-delete-confirm"
                  ref={inputRef}
                  className="input"
                  value={typed}
                  placeholder={CONFIRM_WORD}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit) void onConfirm();
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </>
          )}
        </div>

        <div className="ks-onchain-note">
          <Icon name="info" size={14} />
          <span>
            Files keep living on-chain. Their Walrus storage stays paid up by each SharedBlob&apos;s
            funding pool until it runs out — that&apos;s the whole product point.
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => void onConfirm()}
            loading={submitting}
            disabled={!canSubmit}
          >
            {submitting
              ? "Deleting…"
              : isEmpty
                ? "Delete folder"
                : `Delete folder + ${objCount} ${objCount === 1 ? "object" : "objects"}`}
          </Button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

function deriveFolderName(prefix: string): string {
  const parts = prefix.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? prefix;
}
