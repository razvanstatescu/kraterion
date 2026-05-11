"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { useCreateFolder } from "@/lib/queries";

interface Props {
  open: boolean;
  bucketId: string;
  /** Current breadcrumb prefix — folder is created as its child. */
  parentPrefix: string;
  /** Optional. Lets the dialog warn when the entered name already exists in the listing. */
  existingNames?: ReadonlySet<string>;
  onCancel: () => void;
  /** Called once the marker is created server-side. Receives the new full prefix. */
  onCreated: (prefix: string) => void;
}

/**
 * "New folder" dialog. Pre-creates an empty folder marker in the
 * current prefix.
 *
 * Validation:
 *   - non-empty after trim
 *   - 255 chars max
 *   - no `/` (else it would silently create nested folders)
 *   - no control characters
 *   - case-sensitive duplicate check against the current listing —
 *     S3 keys are case-sensitive, so "Reports" ≠ "reports". The check
 *     is best-effort: server enforces uniqueness via the
 *     (bucket_id, prefix) unique index.
 */
export function NewFolderDialog({
  open,
  bucketId,
  parentPrefix,
  existingNames,
  onCancel,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateFolder(bucketId);
  const { show } = useToast();

  useEffect(() => {
    if (open) {
      setName("");
      setTouched(false);
      // RAF so the input is in the DOM before focus.
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

  const trimmed = name.trim();
  const error = (() => {
    if (!trimmed) return touched ? "Name is required." : "";
    if (trimmed.length > 255) return "Name must be 255 characters or fewer.";
    if (trimmed.includes("/")) return "Folder names can't contain '/'. Create the parent first, then nest into it.";
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1F\x7F]/.test(trimmed)) return "Control characters aren't allowed.";
    if (existingNames?.has(trimmed)) return "A folder with this name already exists here.";
    return "";
  })();

  const canSubmit = trimmed.length > 0 && !error && !submitting;

  const onSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await create.mutateAsync({ name: trimmed, parentPrefix });
      show({ tone: "success", title: `Folder "${trimmed}" created` });
      onCreated(res.folder.prefix);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not create folder.";
      show({ tone: "error", title: "Couldn't create folder", body: message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  const displayParent = parentPrefix || "/";
  return (
    <div className="ks-modal-scrim" onClick={submitting ? undefined : onCancel} role="dialog" aria-modal="true">
      <div className="ks-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ks-modal-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ks-newfolder-glyph" aria-hidden="true">
              <Icon name="folder-plus" size={16} />
            </span>
            <div style={{ fontSize: 18, fontWeight: 500 }}>New folder</div>
          </div>
          <IconButton name="x" label="Cancel" onClick={onCancel} disabled={submitting} />
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <div className="ks-newfolder-parent">
            <span className="micro">In</span>
            <span className="ks-newfolder-parent-path" title={displayParent}>
              {displayParent}
            </span>
          </div>

          <FormField
            label="Folder name"
            htmlFor="new-folder-name"
            required
            helper={error ? undefined : "Letters, numbers, spaces and most punctuation. No slashes."}
            error={touched ? error || undefined : undefined}
          >
            <input
              id="new-folder-name"
              ref={inputRef}
              className={`input${touched && error ? " error" : ""}`}
              value={name}
              maxLength={255}
              placeholder="reports"
              onChange={(e) => {
                setName(e.target.value);
                if (!touched) setTouched(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onSubmit();
              }}
            />
          </FormField>
        </div>

        <div className="ks-onchain-note">
          <Icon name="info" size={14} />
          <span>
            Folders are a dashboard-side affordance — they show up here right away. They become
            visible to boto3 and other S3 clients the moment you upload a real file into them.
          </span>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void onSubmit()} loading={submitting} disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create folder"}
          </Button>
        </div>
      </div>
    </div>
  );
}
