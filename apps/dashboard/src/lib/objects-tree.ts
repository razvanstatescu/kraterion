/**
 * Synthesize a one-level folder listing from S3 keys.
 *
 * S3 has no real folders — they're a UI convention over the `/` character.
 * For a given prefix (e.g. "hero/2026/"), this returns the unique
 * next-level segments ("draft/", "final/") plus the leaf objects that
 * live directly under the prefix.
 *
 * Pure function so unit tests are trivial; no React, no fetch.
 */

import type { S3ObjectJson } from "./api";

export interface FolderEntry {
  kind: "folder";
  name: string;
  /** Full prefix to navigate to ("hero/2026/draft/"). Always ends with "/". */
  prefix: string;
}

export interface ObjectEntry {
  kind: "object";
  name: string;
  object: S3ObjectJson;
}

export type BrowserEntry = FolderEntry | ObjectEntry;

export interface BrowserListing {
  entries: BrowserEntry[];
  /** Folder count + leaf count for the current prefix's row count display. */
  folderCount: number;
  objectCount: number;
}

/**
 * `objects` are the full result of `useObjects(bucketId, { prefix })`.
 * The CP filters server-side by `startsWith(prefix)`, so we don't have
 * to re-filter; we just need to collapse the first remaining segment
 * into a folder if it has a `/`.
 */
export function buildBrowserListing(
  objects: readonly S3ObjectJson[],
  prefix: string,
): BrowserListing {
  const folders = new Map<string, FolderEntry>();
  const leaves: ObjectEntry[] = [];

  for (const obj of objects) {
    if (!obj.s3_key.startsWith(prefix)) continue;
    const tail = obj.s3_key.slice(prefix.length);
    if (!tail) continue;

    const slash = tail.indexOf("/");
    if (slash === -1) {
      // Leaf object directly under the prefix.
      leaves.push({ kind: "object", name: tail, object: obj });
    } else {
      // Synthesize a folder for the first segment.
      const name = tail.slice(0, slash);
      const subPrefix = `${prefix}${name}/`;
      if (!folders.has(subPrefix)) {
        folders.set(subPrefix, { kind: "folder", name, prefix: subPrefix });
      }
    }
  }

  // Folders first, both alphabetized (UTF-8 byte order matches CP's COLLATE "C").
  const folderList = [...folders.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  leaves.sort((a, b) => (a.name < b.name ? -1 : 1));

  return {
    entries: [...folderList, ...leaves],
    folderCount: folderList.length,
    objectCount: leaves.length,
  };
}

/** Split a prefix path into clickable breadcrumb segments. */
export interface PrefixCrumb {
  label: string;
  /** Cumulative prefix up to (and including) this segment. */
  prefix: string;
}

export function splitPrefix(prefix: string): PrefixCrumb[] {
  if (!prefix) return [];
  const parts = prefix.split("/").filter(Boolean);
  const crumbs: PrefixCrumb[] = [];
  let cum = "";
  for (const p of parts) {
    cum += `${p}/`;
    crumbs.push({ label: p, prefix: cum });
  }
  return crumbs;
}

/** Best-effort content-type → icon name mapping. */
export function iconForContentType(ct: string | null | undefined): "image" | "code" | "text" | "file" {
  if (!ct) return "file";
  if (ct.startsWith("image/")) return "image";
  if (ct.startsWith("text/")) return "text";
  if (
    ct === "application/json" ||
    ct === "application/javascript" ||
    ct === "application/xml" ||
    ct === "application/x-yaml" ||
    ct === "application/x-shellscript"
  ) {
    return "code";
  }
  return "file";
}
