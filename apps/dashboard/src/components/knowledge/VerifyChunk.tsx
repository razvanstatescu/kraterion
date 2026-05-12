"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { env } from "@/lib/env";
import type { KnowledgeSearchHit } from "@/lib/queries";

type VerifyState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "success";
      manifestUrl: string;
      onchainHash: string;
      manifestChunkCount: number;
    }
  | {
      kind: "mismatch";
      manifestUrl: string;
      onchainHash: string;
      reason?: string;
    }
  | { kind: "missing"; detail: string }
  | { kind: "error"; detail: string };

interface ManifestChunk {
  ordinal: number;
  content_hash: string;
  tokens?: number;
  start?: number;
  end?: number;
}

interface ManifestJson {
  kraterion_manifest_version: number;
  source_s3_object_id?: string;
  source_walrus_blob_id?: string;
  source_etag?: string;
  embedding_model?: string;
  embedding_dimensions?: number;
  chunks: ManifestChunk[];
  manifest_id?: string;
}

/**
 * The Verify affordance — the demo's verifiability beat made concrete.
 *
 * For a single citation hit, fetches the on-chain manifest blob from
 * Walrus, locates the chunk by ordinal, and compares its recorded
 * content hash against the hash returned by `/search`. Renders the two
 * hashes side-by-side so the user sees the proof, not just a verdict.
 *
 * Failure modes are part of the surface:
 *   - Manifest blob 404 → "Not on chain yet" (amber). Typical during
 *     the first ~30 s after a fresh upload, before the worker
 *     archives the manifest.
 *   - Hash mismatch (different from /search) → "Mismatch" (red). The
 *     dramatic moment that would surface tampering of either the
 *     manifest blob or the chunk content. Should never fire in
 *     practice on this pipeline.
 *   - Network error → "Couldn't reach Walrus" (amber). Retry.
 *
 * Design:
 *   - Inline button in the existing hit links cluster.
 *   - Click expands a hairline-bordered panel under the hit foot
 *     showing the side-by-side hash comparison plus a Walruscan link.
 *   - Border color tracks state via semantic tokens
 *     (`--success` / `--error` / `--warning`). Krater stays out of
 *     this surface — reserved for primary CTAs elsewhere.
 *   - Re-click collapses the panel.
 */
export function VerifyChunk({ hit }: { hit: KnowledgeSearchHit }) {
  const [state, setState] = useState<VerifyState>({ kind: "idle" });

  const onClick = async () => {
    // Re-click collapses the panel.
    if (state.kind !== "idle" && state.kind !== "loading") {
      setState({ kind: "idle" });
      return;
    }

    if (!hit.manifest_walrus_blob_id) {
      setState({
        kind: "missing",
        detail:
          "This chunk's indexing manifest hasn't been archived on chain yet. " +
          "Re-run the search in ~30 seconds, or re-upload to force a fresh archive.",
      });
      return;
    }

    setState({ kind: "loading" });
    const manifestUrl = `${env.walrusAggregatorUrl}/v1/blobs/${hit.manifest_walrus_blob_id}`;

    try {
      const res = await fetch(manifestUrl);
      if (!res.ok) {
        setState({
          kind: "missing",
          detail: `Walrus aggregator returned ${res.status}. The blob may not have propagated yet.`,
        });
        return;
      }
      const json = (await res.json()) as ManifestJson;
      if (!Array.isArray(json.chunks)) {
        setState({
          kind: "error",
          detail: "Manifest doesn't contain a chunks array — unexpected shape.",
        });
        return;
      }
      const chunk = json.chunks.find((c) => c.ordinal === hit.ordinal);
      if (!chunk) {
        setState({
          kind: "mismatch",
          manifestUrl,
          onchainHash: "",
          reason: `Chunk ordinal ${hit.ordinal} not present in the on-chain manifest.`,
        });
        return;
      }
      const onchainHash = String(chunk.content_hash).toLowerCase();
      const localHash = hit.content_hash.toLowerCase();
      if (onchainHash === localHash) {
        setState({
          kind: "success",
          manifestUrl,
          onchainHash,
          manifestChunkCount: json.chunks.length,
        });
      } else {
        setState({
          kind: "mismatch",
          manifestUrl,
          onchainHash,
        });
      }
    } catch (err) {
      setState({
        kind: "error",
        detail: `Couldn't reach Walrus: ${(err as Error).message}`,
      });
    }
  };

  const buttonLabel =
    state.kind === "idle"
      ? "Verify"
      : state.kind === "loading"
        ? "Verifying…"
        : state.kind === "success"
          ? "Verified"
          : state.kind === "mismatch"
            ? "Mismatch"
            : state.kind === "missing"
              ? "Not on chain yet"
              : "Retry verify";
  const buttonTone =
    state.kind === "success"
      ? "success"
      : state.kind === "mismatch"
        ? "error"
        : state.kind === "missing"
          ? "warning"
          : state.kind === "error"
            ? "warning"
            : null;
  const buttonIcon =
    state.kind === "success"
      ? "check"
      : state.kind === "mismatch"
        ? "alert"
        : state.kind === "missing" || state.kind === "error"
          ? "alert"
          : "check";

  return (
    <>
      <button
        type="button"
        className={`ks-verify-trigger ${buttonTone ? `is-${buttonTone}` : ""} ${state.kind === "loading" ? "is-loading" : ""}`}
        onClick={onClick}
        disabled={state.kind === "loading"}
        aria-expanded={state.kind !== "idle" && state.kind !== "loading"}
      >
        <Icon name={buttonIcon} size={14} />
        {buttonLabel}
      </button>
      {state.kind !== "idle" && state.kind !== "loading" ? (
        <VerifyPanel state={state} hit={hit} />
      ) : null}
    </>
  );
}

function VerifyPanel({
  state,
  hit,
}: {
  state: Exclude<VerifyState, { kind: "idle" } | { kind: "loading" }>;
  hit: KnowledgeSearchHit;
}) {
  const tone =
    state.kind === "success"
      ? "success"
      : state.kind === "mismatch"
        ? "error"
        : "warning";

  return (
    <div className={`ks-verify-panel ks-verify-${tone}`}>
      <div className="ks-verify-row">
        <span className="ks-verify-label">On chain</span>
        <code className="ks-verify-hash">
          {state.kind === "success" || state.kind === "mismatch"
            ? state.onchainHash || "—"
            : "—"}
        </code>
      </div>
      <div className="ks-verify-row">
        <span className="ks-verify-label">From search</span>
        <code
          className={`ks-verify-hash ${state.kind === "mismatch" ? "is-divergent" : ""}`}
        >
          {hit.content_hash.toLowerCase()}
        </code>
      </div>

      <div className="ks-verify-verdict">
        {state.kind === "success" ? (
          <>
            <span className="ks-verify-icon ks-verify-icon-success" aria-hidden>
              <Icon name="check" size={14} />
            </span>
            <span>
              Chunk {hit.ordinal + 1} of {state.manifestChunkCount} matches the
              on-chain manifest. The retrieval is reproducible from{" "}
              <a
                href={state.manifestUrl}
                target="_blank"
                rel="noreferrer"
                className="ks-verify-link"
              >
                this Walrus blob
              </a>
              .
            </span>
          </>
        ) : state.kind === "mismatch" ? (
          <>
            <span className="ks-verify-icon ks-verify-icon-error" aria-hidden>
              <Icon name="alert" size={14} />
            </span>
            <span>
              The hashes don&apos;t match.{" "}
              {state.reason
                ? state.reason
                : "Either the on-chain manifest has been tampered with, " +
                  "or the chunk content was altered after indexing — neither should " +
                  "happen on a healthy pipeline."}{" "}
              <a
                href={state.manifestUrl}
                target="_blank"
                rel="noreferrer"
                className="ks-verify-link"
              >
                Open manifest
              </a>
            </span>
          </>
        ) : (
          <>
            <span className="ks-verify-icon ks-verify-icon-warning" aria-hidden>
              <Icon name="alert" size={14} />
            </span>
            <span>{state.detail}</span>
          </>
        )}
      </div>
    </div>
  );
}
