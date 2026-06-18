"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Drawer } from "@/components/ui/Drawer";
import { Pill } from "@/components/ui/Pill";
import { Skel } from "@/components/ui/Skeleton";
import { ControlPlaneError, type BucketJson, type S3ObjectJson } from "@/lib/api";
import { formatBytes, formatRelative } from "@/lib/format";
import { buildBrowserListing, iconForContentType, splitPrefix } from "@/lib/objects-tree";
import { useFolderMarkers, useObjects } from "@/lib/queries";
import { DeleteFolderDialog } from "./DeleteFolderDialog";
import { Inspector } from "./Inspector";
import { NewFolderDialog } from "./NewFolderDialog";

interface Props {
  bucket: BucketJson;
  /** Lifted so the bucket page's Uploader writes to the same folder. */
  prefix: string;
  onPrefixChange: (next: string) => void;
}

/**
 * Two-column file browser:
 *   - Single file table that contains both folders and files (folders
 *     sort above files). Breadcrumb on top, search on the right.
 *   - Inspector pane appears on the right ONLY when a file is selected.
 *     Removed when nothing's selected so the table fills the screen.
 *
 * No separate folder tree. The breadcrumb is the only navigation
 * affordance; folder rows in the table are the drill-in. Matches the
 * dominant pattern across Cloudflare R2, AWS S3 console, DigitalOcean
 * Spaces, and Vercel Blob. The Supabase dual-tree-and-inline pattern
 * deliberately rejected — redundant clicks, two sources of truth.
 *
 * `prefix` is the client-side "current folder" — appended to every
 * `useObjects` call so the CP-side `prefix` query param does the
 * server filtering. We render synthetic folder rows for sub-prefixes
 * the page response surfaces.
 */
export function FileBrowser({ bucket, prefix, onPrefixChange }: Props) {
  const setPrefix = onPrefixChange;
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<S3ObjectJson | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useObjects(
    bucket.id,
    { prefix: prefix || undefined, limit: 200 },
  );

  const { data: foldersData } = useFolderMarkers(bucket.id);

  const allObjects = useMemo(
    () => data?.pages.flatMap((p) => p.objects) ?? [],
    [data],
  );

  const folderMarkerPrefixes = useMemo(
    () => foldersData?.folders.map((f) => f.prefix) ?? [],
    [foldersData],
  );

  const listing = useMemo(
    () => buildBrowserListing(allObjects, prefix, folderMarkerPrefixes),
    [allObjects, prefix, folderMarkerPrefixes],
  );

  /** Names of folders already visible in the current prefix — passed to the
   *  dialog so it can warn on duplicates before the server roundtrip. */
  const existingFolderNames = useMemo(() => {
    const set = new Set<string>();
    for (const entry of listing.entries) {
      if (entry.kind === "folder") set.add(entry.name);
    }
    return set;
  }, [listing]);

  const visibleEntries = filter
    ? listing.entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : listing.entries;

  const crumbs = splitPrefix(prefix);

  // Close the inspector with Escape — matches the rest of the modal /
  // drawer behavior in the app.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selected]);

  // Reset the selection whenever the prefix changes — the previously
  // selected object may not be in the new folder's listing.
  useEffect(() => {
    setSelected(null);
  }, [prefix]);

  if (error) {
    const message =
      error instanceof ControlPlaneError ? error.message : "Couldn't load objects. Try again.";
    return <Banner tone="error" title="Failed to load objects" body={message} />;
  }

  // Object details lives in a right-side overlay drawer rather than an
  // inline column. Three reasons:
  //   1. Inspector content is long (file details + on-chain expander +
  //      action buttons). An inline pane shoves the file table
  //      narrower and scrolls past the bucket header — the user loses
  //      context.
  //   2. A floating drawer has its own scroll container, so the file
  //      list keeps its position while the user reads details.
  //   3. Matches the pattern users already know from BucketSettingsDrawer
  //      + the Linear/Notion/GitHub side-panel convention.
  const filename = selected ? selected.s3_key.split("/").pop() || selected.s3_key : "";
  const inspectorDrawer = (
    <Drawer
      open={!!selected}
      onClose={() => setSelected(null)}
      title={filename}
      eyebrow="Object details"
      width={480}
    >
      {selected ? (
        <Inspector
          object={selected}
          bucket={bucket}
          onDeleted={() => setSelected(null)}
        />
      ) : null}
    </Drawer>
  );

  return (
    <div className="ks-browser-v2">
      <div className="ks-files">
        <div className="ks-files-toolbar">
          <div className="ks-crumbs" style={{ fontSize: 13 }}>
            <button
              className="ks-crumb-link"
              onClick={() => {
                setPrefix("");
                setSelected(null);
              }}
              style={{ color: prefix === "" ? "var(--text-primary)" : undefined }}
            >
              {bucket.name}
            </button>
            {crumbs.map((c, i) => (
              <span key={c.prefix} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Icon name="chevron" size={14} style={{ color: "var(--text-tertiary)" }} />
                <button
                  className="ks-crumb-link"
                  onClick={() => {
                    setPrefix(c.prefix);
                    setSelected(null);
                  }}
                  style={{ color: i === crumbs.length - 1 ? "var(--text-primary)" : undefined }}
                >
                  {c.label}
                </button>
              </span>
            ))}
            {prefix ? (
              <button
                type="button"
                className="ks-crumb-delete"
                title="Delete this folder"
                aria-label={`Delete folder ${crumbs[crumbs.length - 1]?.label ?? prefix}`}
                onClick={() => setFolderToDelete(prefix)}
              >
                <Icon name="trash" size={14} />
              </button>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              icon="folder-plus"
              onClick={() => setNewFolderOpen(true)}
            >
              New folder
            </Button>
            <div className="ks-search" style={{ width: 240 }}>
              <Icon name="search" size={14} />
              <input
                placeholder="Filter objects"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ks-table" style={{ border: "none", borderRadius: 0 }}>
          <div className="ks-thead">
            <div style={{ flex: "2 1 0" }}>Name</div>
            <div style={{ flex: "1 1 0" }}>Size</div>
            <div style={{ flex: "1 1 0" }}>Modified</div>
            <div style={{ flex: "1 1 0" }}>Visibility</div>
          </div>

          {isLoading ? (
            // Mirror the real listing: a couple of folder rows (krater
            // icon, dashes for size/modified) above file rows (type icon,
            // size, modified, visibility pill). Widths vary so it reads
            // like content, not a grid.
            <div role="status" aria-busy="true" aria-label="Loading objects">
              {[148, 120].map((w, i) => (
                <div key={`skel-folder-${i}`} className="ks-trow ks-trow-skel">
                  <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10 }}>
                    <Skel shape="circle" width={16} height={16} style={{ background: "color-mix(in srgb, var(--krater) 32%, var(--skel))" }} />
                    <Skel width={w} />
                  </div>
                  <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                  <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                  <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                </div>
              ))}
              {[196, 132, 168, 224, 112].map((w, i) => (
                <div key={`skel-file-${i}`} className="ks-trow ks-trow-skel">
                  <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10 }}>
                    <Skel shape="circle" width={16} height={16} />
                    <Skel width={w} />
                  </div>
                  <div style={{ flex: "1 1 0" }}><Skel width={48} /></div>
                  <div style={{ flex: "1 1 0" }}><Skel width={76} /></div>
                  <div style={{ flex: "1 1 0" }}><Skel shape="pill" width={64} /></div>
                </div>
              ))}
            </div>
          ) : visibleEntries.length === 0 ? (
            <div className="ks-trow ks-trow-static" style={{ padding: "32px 16px", display: "block" }}>
              <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 14 }}>
                {filter
                  ? <>No matches for &ldquo;{filter}&rdquo;.</>
                  : prefix
                    ? "This folder is empty."
                    : "This bucket is empty. Drag files here or click Upload."}
              </div>
            </div>
          ) : (
            visibleEntries.map((entry) => {
              if (entry.kind === "folder") {
                const openFolder = () => {
                  setPrefix(entry.prefix);
                  setSelected(null);
                };
                return (
                  <div
                    key={`folder-${entry.prefix}`}
                    className="ks-trow ks-trow-folder"
                    role="button"
                    tabIndex={0}
                    onClick={openFolder}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openFolder();
                      }
                    }}
                  >
                    <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Icon name="folder" size={16} style={{ color: "var(--krater)", flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{entry.name}</span>
                    </div>
                    <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                    <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                    <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      <button
                        type="button"
                        className="ks-folder-delete"
                        aria-label={`Delete folder ${entry.name}`}
                        title="Delete folder"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFolderToDelete(entry.prefix);
                        }}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </div>
                );
              }
              const o = entry.object;
              const iconName = iconForContentType(o.content_type);
              const isSelected = selected?.id === o.id;
              return (
                <button
                  key={o.id}
                  className={`ks-trow${isSelected ? " is-selected" : ""}`}
                  onClick={() => setSelected(o)}
                >
                  <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <Icon name={iconName} size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {entry.name}
                    </span>
                  </div>
                  <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>
                    {formatBytes(o.size_bytes)}
                  </div>
                  <div style={{ flex: "1 1 0", color: "var(--text-secondary)" }}>
                    {formatRelative(o.uploaded_at)}
                  </div>
                  <div style={{ flex: "1 1 0" }}>
                    <Pill tone={bucket.encryption_mode === "private" ? "neutral" : "info"}>
                      {bucket.encryption_mode === "private" ? "Private" : "Public"}
                    </Pill>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {hasNextPage ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchNextPage()}
              loading={isFetchingNextPage}
            >
              Load more
            </Button>
          </div>
        ) : null}
      </div>

      {inspectorDrawer}

      <NewFolderDialog
        open={newFolderOpen}
        bucketId={bucket.id}
        parentPrefix={prefix}
        existingNames={existingFolderNames}
        onCancel={() => setNewFolderOpen(false)}
        onCreated={(newPrefix) => {
          setNewFolderOpen(false);
          // Drop the user into the freshly-minted folder so they can
          // upload right away — matches Supabase / R2 console behavior.
          setPrefix(newPrefix);
          setSelected(null);
        }}
      />

      <DeleteFolderDialog
        open={folderToDelete !== null}
        bucketId={bucket.id}
        prefix={folderToDelete ?? ""}
        onCancel={() => setFolderToDelete(null)}
        onPurged={() => {
          // If we were inside the deleted folder (or one of its nested
          // children), bounce back to its parent prefix — listing it
          // would otherwise show a misleading "empty folder" state.
          if (folderToDelete && prefix.startsWith(folderToDelete)) {
            const parts = folderToDelete.split("/").filter(Boolean);
            const parent = parts.slice(0, -1).join("/");
            setPrefix(parent ? `${parent}/` : "");
            setSelected(null);
          }
          setFolderToDelete(null);
        }}
      />
    </div>
  );
}
