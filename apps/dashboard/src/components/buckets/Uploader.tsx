"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type BucketJson } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { uploadWithProgress, useInvalidateBucketObjects, usePrepareUpload } from "@/lib/objects";

interface QueueItem {
  id: number;
  file: File;
  key: string;
  status: "queued" | "uploading" | "done" | "failed";
  progress: number;
  error?: string;
  abort?: AbortController;
}

interface Props {
  bucket: BucketJson;
  /** Current prefix the file browser is showing — uploaded keys land here. */
  prefix: string;
  children: ReactNode;
}

/**
 * Wraps the bucket detail body with a drag-drop overlay.
 *
 * Listens for `dragenter` on the wrapper; while a drag is active the
 * children render under a full-bleed "Drop files to upload" backdrop.
 * On drop, files queue up in the bottom-right sticky panel and run in
 * parallel through `usePrepareUpload` + `uploadWithProgress`.
 *
 * Uploaded keys go to `<prefix><file.name>` — Supabase / R2 convention.
 * If you've drilled into `hero/2026/`, dropping a `cover.jpg` writes
 * `hero/2026/cover.jpg`.
 */
export function Uploader({ bucket, prefix, children }: Props) {
  const prepareUpload = usePrepareUpload();
  const invalidate = useInvalidateBucketObjects();
  const { show } = useToast();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragDepth, setDragDepth] = useState(0); // cumulative enter/leave count
  const nextId = useRef(1);

  const isDragging = dragDepth > 0;

  const updateItem = useCallback((id: number, patch: Partial<QueueItem>) => {
    setQueue((q) => q.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const runUpload = useCallback(
    async (item: QueueItem) => {
      const abort = new AbortController();
      updateItem(item.id, { status: "uploading", abort });
      try {
        const signed = await prepareUpload.mutateAsync({
          bucket_id: bucket.id,
          key: item.key,
          content_type: item.file.type || "application/octet-stream",
        });
        await uploadWithProgress({
          signed,
          file: item.file,
          onProgress: (frac) => updateItem(item.id, { progress: frac }),
          signal: abort.signal,
        });
        updateItem(item.id, { status: "done", progress: 1 });
        // Indexer picks the row up within ~30s; nudge React Query to
        // refetch over the next minute.
        invalidate(bucket.id);
        show({
          tone: "success",
          title: `${item.file.name} uploaded`,
          body: "Visible in the file list once the indexer catches up (~30s).",
        });
      } catch (err) {
        const message =
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Upload failed.";
        updateItem(item.id, { status: "failed", error: message });
        show({ tone: "error", title: `${item.file.name} upload failed`, body: message });
      }
    },
    [bucket.id, prepareUpload, invalidate, show, updateItem],
  );

  const enqueue = useCallback(
    (files: File[]) => {
      const items: QueueItem[] = files.map((file) => ({
        id: nextId.current++,
        file,
        key: `${prefix}${file.name}`,
        status: "queued",
        progress: 0,
      }));
      setQueue((q) => [...q, ...items]);
      for (const item of items) void runUpload(item);
    },
    [prefix, runUpload],
  );

  // === Drag handlers (page-level via wrapper div) ===

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDragDepth((d) => d + 1);
    }
  }, []);

  const onDragLeave = useCallback(() => {
    setDragDepth((d) => Math.max(0, d - 1));
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setDragDepth(0);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) enqueue(files);
    },
    [enqueue],
  );

  // === Hidden file input for the "click to upload" path ===

  const fileInput = useRef<HTMLInputElement | null>(null);
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) enqueue(files);
    if (fileInput.current) fileInput.current.value = "";
  };

  useEffect(() => {
    // Auto-clear `done` items after 5s to keep the queue tidy.
    const tick = setInterval(() => {
      setQueue((q) => q.filter((it) => it.status !== "done" || Date.now() - it.id < 5000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ position: "relative" }}
    >
      {children}

      {/* Drag overlay — full-bleed Cream tint with a dashed border. */}
      {isDragging ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(248, 244, 236, 0.92)",
            border: "2px dashed var(--krater)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <Icon name="upload" size={24} style={{ color: "var(--krater)" }} />
            <div style={{ fontSize: 18, fontWeight: 500, marginTop: 8 }}>
              Drop to upload to {bucket.name}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
              {prefix ? <>Path: {bucket.name}/{prefix}</> : <>Path: {bucket.name}/</>}
            </div>
          </div>
        </div>
      ) : null}

      {/* Hidden file input — triggered by the upload CTA in the page head. */}
      <input
        ref={fileInput}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={onFileChange}
      />

      {/* Sticky upload queue, bottom-right. */}
      {queue.length > 0 ? <UploadQueue queue={queue} onDismiss={(id) => setQueue((q) => q.filter((it) => it.id !== id))} /> : null}

      {/* Imperative trigger for the page's Upload CTA. */}
      <UploadHandleBridge openPicker={() => fileInput.current?.click()} />
    </div>
  );
}

function UploadQueue({
  queue,
  onDismiss,
}: {
  queue: QueueItem[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 340,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        zIndex: 150,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: "var(--stone-50)",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: "var(--text-secondary)",
        }}
      >
        Uploads ({queue.filter((it) => it.status !== "done").length} active)
      </div>
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {queue.map((item) => (
          <div
            key={item.id}
            style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon
                name={
                  item.status === "done"
                    ? "info"
                    : item.status === "failed"
                      ? "alert"
                      : "upload"
                }
                size={14}
                style={{ color: item.status === "failed" ? "var(--error)" : "var(--text-secondary)" }}
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={item.key}
              >
                {item.file.name}
              </span>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {formatBytes(item.file.size)}
              </span>
              {(item.status === "done" || item.status === "failed") ? (
                <IconButton name="x" label="Dismiss" onClick={() => onDismiss(item.id)} />
              ) : null}
            </div>
            {item.status === "uploading" ? (
              <div
                style={{
                  height: 4,
                  background: "var(--stone-100)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(item.progress * 100)}%`,
                    background: "var(--krater)",
                    transition: "width 120ms var(--ease)",
                  }}
                />
              </div>
            ) : item.status === "failed" ? (
              <div className="ks-field-error">{item.error}</div>
            ) : item.status === "done" ? (
              <div className="ks-field-helper" style={{ color: "var(--success)" }}>
                Done — appears in the list in ~30s.
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Tiny bridge that registers a global window function so the bucket
 * detail page's "Upload" button can call it. Avoids prop drilling and
 * keeps the file input next to the queue UI.
 */
declare global {
  interface Window {
    __kraterionOpenUploader?: () => void;
  }
}
function UploadHandleBridge({ openPicker }: { openPicker: () => void }) {
  useEffect(() => {
    window.__kraterionOpenUploader = openPicker;
    return () => {
      delete window.__kraterionOpenUploader;
    };
  }, [openPicker]);
  return null;
}
