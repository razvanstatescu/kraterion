"use client";

import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { ControlPlaneError } from "@/lib/api";
import { env } from "@/lib/env";
import { suiscanObjectUrl, walrusAggregatorUrl } from "@/lib/format";
import {
  useKnowledgeSearch,
  type KnowledgeSearchHit,
  type KnowledgeSearchResponse,
} from "@/lib/queries";
import { VerifyChunk } from "./VerifyChunk";

interface Props {
  bucketId: string;
  bucketName: string;
}

/**
 * Live query box. Calls `/search` (hybrid BM25 + vector + RRF). We use
 * the dashboard-only retrieval path on purpose — `/ask` requires a
 * user-supplied OpenAI key (plan §6.3 BYO) and keeping it off the
 * dashboard reduces the chance of a key getting pasted into a browser
 * console session.
 */
export function KnowledgeSearch({ bucketId, bucketName }: Props) {
  const search = useKnowledgeSearch(bucketId);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<KnowledgeSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setError(null);
    try {
      const res = await search.mutateAsync({ query: query.trim() });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Search failed.",
      );
      setResult(null);
    }
  };

  return (
    <div className="ks-card">
      <div className="ks-card-head">
        <div className="ks-card-title">Search this bucket</div>
        <div className="ks-card-sub">
          Hybrid BM25 + vector retrieval over indexed chunks. The same
          path your agents hit, minus the LLM step.
        </div>
      </div>
      <div className="ks-card-body">
        <form onSubmit={onSubmit} className="ks-search-form">
          <label className="ks-search ks-search-grow">
            <Icon name="search" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${bucketName}…`}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={!query.trim() || search.isPending}
            loading={search.isPending}
          >
            Search
          </Button>
        </form>

        {error ? (
          <div style={{ marginTop: 16 }}>
            <Banner tone="error" title="Couldn't run that search" body={error} />
          </div>
        ) : null}

        {result ? <SearchResults result={result} /> : null}
      </div>
    </div>
  );
}

function SearchResults({ result }: { result: KnowledgeSearchResponse }) {
  if (result.hits.length === 0) {
    return (
      <div className="ks-search-meta">
        <Pill tone="neutral">0 hits</Pill>
        <span className="ks-meta-sep">·</span>
        <span>{result.latency_ms} ms</span>
        <span className="ks-meta-sep">·</span>
        <span>Try a different phrasing, or index more objects.</span>
      </div>
    );
  }

  return (
    <>
      <div className="ks-search-meta">
        <Pill tone="info">{result.hits.length} hit{result.hits.length === 1 ? "" : "s"}</Pill>
        <span className="ks-meta-sep">·</span>
        <span>{result.latency_ms} ms</span>
        <span className="ks-meta-sep">·</span>
        <span>{result.embedding_model} · {result.embedding_dimensions}d</span>
      </div>
      <ul className="ks-hits">
        {result.hits.map((h) => (
          <SearchHit key={h.id} hit={h} />
        ))}
      </ul>
    </>
  );
}

function SearchHit({ hit }: { hit: KnowledgeSearchHit }) {
  return (
    <li className="ks-hit">
      <div className="ks-hit-head">
        <span className="ks-hit-key">
          <Icon name="file" size={14} />
          {hit.s3_key}
        </span>
        <span className="ks-hit-ord">#{hit.ordinal}</span>
      </div>
      <p className="ks-hit-body">{hit.content}</p>
      <div className="ks-hit-foot">
        <div className="ks-hit-scores">
          <span>
            <em>rrf</em> {hit.rrf_score.toFixed(4)}
          </span>
          {hit.bm25_score !== null ? (
            <>
              <span className="ks-meta-sep">·</span>
              <span>
                <em>bm25</em> {hit.bm25_score.toFixed(4)}
              </span>
            </>
          ) : null}
          {hit.vector_distance !== null ? (
            <>
              <span className="ks-meta-sep">·</span>
              <span>
                <em>distance</em> {hit.vector_distance.toFixed(4)}
              </span>
            </>
          ) : null}
        </div>
        <div className="ks-hit-links">
          <a
            className="ks-hit-link"
            href={walrusAggregatorUrl(hit.source_walrus_blob_id)}
            target="_blank"
            rel="noreferrer"
            title="Fetch the source object from Walrus"
          >
            <Icon name="link" size={14} />
            Source blob
          </a>
          {hit.source_pooled_blob_object_id ? (
            <a
              className="ks-hit-link"
              href={suiscanObjectUrl(hit.source_pooled_blob_object_id, env.network)}
              target="_blank"
              rel="noreferrer"
              title="Open the on-chain PooledBlob on Sui explorer"
            >
              <Icon name="arrow-up-right" size={14} />
              On chain
            </a>
          ) : null}
          {hit.manifest_walrus_blob_id ? (
            <a
              className="ks-hit-link"
              href={walrusAggregatorUrl(hit.manifest_walrus_blob_id)}
              target="_blank"
              rel="noreferrer"
              title="Fetch the indexing manifest from Walrus"
            >
              <Icon name="text" size={14} />
              Manifest
            </a>
          ) : null}
        </div>
      </div>
      <div className="ks-hit-verify">
        <VerifyChunk
          content_hash={hit.content_hash}
          ordinal={hit.ordinal}
          manifest_walrus_blob_id={hit.manifest_walrus_blob_id}
        />
      </div>
    </li>
  );
}
