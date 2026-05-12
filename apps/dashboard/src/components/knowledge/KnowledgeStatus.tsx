"use client";

import { Pill } from "@/components/ui/Pill";
import type { KnowledgeStatus as KnowledgeStatusJson } from "@/lib/queries";

interface Props {
  status: KnowledgeStatusJson;
}

/**
 * Compact status panel: how many objects are indexed, how many still
 * pending, settings the indexer is running with. Greys out when
 * Knowledge is off — the toggle card carries the call to action.
 */
export function KnowledgeStatus({ status }: Props) {
  const s = status.summary;
  const indexedPct =
    s.total_objects === 0 ? 0 : Math.round((s.indexed / s.total_objects) * 100);
  const hasPending = s.pending > 0;
  const allDone = s.total_objects > 0 && s.indexed === s.total_objects;

  return (
    <div className="ks-card">
      <div className="ks-card-head">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <div className="ks-card-title">Index status</div>
            <div className="ks-card-sub">
              {status.enabled
                ? "Workers pick up new uploads automatically. Backfilled objects show up here as the queue drains."
                : "Knowledge is off for this bucket. Enable it to start indexing."}
            </div>
          </div>
          {status.enabled ? (
            allDone ? (
              <Pill tone="success" dot>All indexed</Pill>
            ) : hasPending ? (
              <Pill tone="info" dot>Indexing</Pill>
            ) : (
              <Pill tone="neutral">Idle</Pill>
            )
          ) : (
            <Pill tone="neutral">Off</Pill>
          )}
        </div>
      </div>

      <div className="ks-card-body">
        <dl className="ks-kv-grid">
          <div className="ks-kv">
            <dt>Indexed</dt>
            <dd>
              <span className="ks-kv-strong">{s.indexed.toLocaleString()}</span>
              <span className="ks-kv-faint"> of {s.total_objects.toLocaleString()}</span>
            </dd>
          </div>
          <div className="ks-kv">
            <dt>Pending</dt>
            <dd>{s.pending.toLocaleString()}</dd>
          </div>
          <div className="ks-kv">
            <dt>Failed</dt>
            <dd>{s.failed.toLocaleString()}</dd>
          </div>
          <div className="ks-kv">
            <dt>Skipped</dt>
            <dd>{s.skipped.toLocaleString()}</dd>
          </div>
        </dl>

        {status.enabled && s.total_objects > 0 ? (
          <div className="ks-progress" aria-label={`${indexedPct}% indexed`}>
            <div
              className="ks-progress-fill"
              style={{ width: `${indexedPct}%` }}
            />
          </div>
        ) : null}

        {status.settings ? (
          <details className="ks-disclosure ks-disclosure-compact">
            <summary>Indexing details</summary>
            <div className="ks-meta-row" style={{ marginTop: 8 }}>
              <span>
                <em>Model</em> {status.settings.embedding_model}
              </span>
              <span className="ks-meta-sep">·</span>
              <span>
                <em>Dimensions</em> {status.settings.embedding_dimensions}
              </span>
              <span className="ks-meta-sep">·</span>
              <span>
                <em>Chunk</em> {status.settings.chunk_tokens} tokens,{" "}
                {status.settings.chunk_overlap_tokens} overlap
              </span>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
