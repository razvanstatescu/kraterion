"use client";

import { useMemo, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError, type BucketJson, type S3ObjectJson } from "@/lib/api";
import { formatBytes, formatRelative } from "@/lib/format";
import { buildBrowserListing, iconForContentType, splitPrefix } from "@/lib/objects-tree";
import { useObjects } from "@/lib/queries";
import { Inspector } from "./Inspector";

interface Props {
  bucket: BucketJson;
}

/**
 * Three-pane file browser. Supabase-style:
 *   - breadcrumb on top, click any segment to jump back up
 *   - file table in the middle (folders sort above leaves)
 *   - inspector on the right, half-pane, pinned to one selection
 *
 * `prefix` is the client-side "current folder" — appended to every
 * `useObjects` call so the CP-side `prefix` query param does the
 * server filtering. We render synthetic folder rows for sub-prefixes
 * the page response surfaces.
 */
export function FileBrowser({ bucket }: Props) {
  const [prefix, setPrefix] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<S3ObjectJson | null>(null);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useObjects(
    bucket.id,
    { prefix: prefix || undefined, limit: 200 },
  );

  const allObjects = useMemo(
    () => data?.pages.flatMap((p) => p.objects) ?? [],
    [data],
  );

  const listing = useMemo(
    () => buildBrowserListing(allObjects, prefix),
    [allObjects, prefix],
  );

  const visibleEntries = filter
    ? listing.entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase()))
    : listing.entries;

  const crumbs = splitPrefix(prefix);

  if (error) {
    const message =
      error instanceof ControlPlaneError ? error.message : "Couldn't load objects. Try again.";
    return <Banner tone="error" title="Failed to load objects" body={message} />;
  }

  return (
    <div className="ks-browser">
      {/* Folder tree — left column. Shows the parent (root) + every
          synthesized first-level folder under the current prefix. */}
      <aside className="ks-tree">
        <div className="micro" style={{ padding: "0 12px 8px" }}>Folders</div>
        <button
          className={`ks-tree-item${prefix === "" ? " is-active" : ""}`}
          onClick={() => {
            setPrefix("");
            setSelected(null);
          }}
        >
          <Icon name="folder" size={14} />
          <span>{bucket.name}</span>
        </button>
        {listing.entries
          .filter((e): e is Extract<typeof e, { kind: "folder" }> => e.kind === "folder")
          .map((f) => (
            <button
              key={f.prefix}
              className="ks-tree-item"
              style={{ paddingLeft: 28 }}
              onClick={() => {
                setPrefix(f.prefix);
                setSelected(null);
              }}
            >
              <Icon name="folder" size={14} />
              <span>{f.name}</span>
            </button>
          ))}
      </aside>

      {/* File table — middle column. Breadcrumb up top, search input,
          then folders + objects. */}
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
          </div>
          <div className="ks-search" style={{ width: 240 }}>
            <Icon name="search" size={14} />
            <input
              placeholder="Filter objects"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
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
            <div className="ks-trow" style={{ cursor: "default" }}>
              <div className="muted" style={{ flex: 1 }}>Loading…</div>
            </div>
          ) : visibleEntries.length === 0 ? (
            <div style={{ padding: 24 }}>
              <EmptyState
                icon="folder"
                title={prefix ? "This folder is empty" : "This bucket is empty"}
                body={
                  prefix
                    ? "Nothing under this prefix yet."
                    : "Drop files here or click Upload. Object I/O lights up in Phase E."
                }
              />
            </div>
          ) : (
            visibleEntries.map((entry) => {
              if (entry.kind === "folder") {
                return (
                  <button
                    key={`folder-${entry.prefix}`}
                    className="ks-trow"
                    onClick={() => {
                      setPrefix(entry.prefix);
                      setSelected(null);
                    }}
                  >
                    <div style={{ flex: "2 1 0", display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Icon name="folder" size={16} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                      <span style={{ fontWeight: 500 }}>{entry.name}/</span>
                    </div>
                    <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                    <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                    <div style={{ flex: "1 1 0", color: "var(--text-tertiary)" }}>—</div>
                  </button>
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

      {/* Inspector — right column. Empty until something's selected. */}
      {selected ? (
        <Inspector
          object={selected}
          bucketName={bucket.name}
          encryptionMode={bucket.encryption_mode}
        />
      ) : (
        <aside className="ks-inspector">
          <div className="muted" style={{ fontSize: 13 }}>
            Select an object to see its on-chain details.
          </div>
        </aside>
      )}
    </div>
  );
}
