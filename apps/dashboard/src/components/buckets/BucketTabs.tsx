"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

interface Props {
  bucketId: string;
  active: "files" | "knowledge";
}

/**
 * Small tab strip on the bucket detail page. Files is the existing
 * default landing; Knowledge is the K4 surface. Settings stays as a
 * drawer (not a tab) because it's a side-task, not a peer view.
 */
export function BucketTabs({ bucketId, active }: Props) {
  return (
    <nav className="ks-subtabs" aria-label="Bucket sections">
      <Link
        href={`/buckets/${bucketId}`}
        className={`ks-subtab ${active === "files" ? "is-active" : ""}`}
      >
        <Icon name="folder" size={14} />
        Files
      </Link>
      <Link
        href={`/buckets/${bucketId}/knowledge`}
        className={`ks-subtab ${active === "knowledge" ? "is-active" : ""}`}
      >
        <Icon name="search" size={14} />
        Knowledge
      </Link>
    </nav>
  );
}
