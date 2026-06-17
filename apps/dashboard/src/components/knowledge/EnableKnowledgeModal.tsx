"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DEFAULT_EMBEDDING_OPTION,
  EMBEDDING_OPTIONS,
  estimateEmbeddingCostUsd,
  type EmbeddingOption,
} from "@kraterion/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Pill } from "@/components/ui/Pill";
import { Portal } from "@/components/ui/Portal";
import { formatBytes } from "@/lib/format";
import { useMe, useProviderCredentials, type KnowledgeStatus } from "@/lib/queries";
import type { ToggleKnowledgePayload } from "@/lib/queries";

interface Props {
  open: boolean;
  status: KnowledgeStatus;
  busy: boolean;
  /** "enable" (default) is the first-time flow. "reindex" is the
   *  destructive change-settings flow: pre-fills the picker from
   *  current settings, swaps copy + button labels, and the confirm
   *  step shows the destructive banner. */
  mode?: "enable" | "reindex";
  onCancel: () => void;
  onConfirm: (payload: ToggleKnowledgePayload) => void | Promise<void>;
}

type Step = "embedding" | "confirm";

function findOptionId(model?: string, dims?: number): string {
  if (!model || !dims) return DEFAULT_EMBEDDING_OPTION.id;
  return (
    EMBEDDING_OPTIONS.find((o) => o.model === model && o.dimensions === dims)?.id ??
    DEFAULT_EMBEDDING_OPTION.id
  );
}

/**
 * Two-step modal: embedding model → confirm. Captures the user's picks
 * before Knowledge is enabled (or re-indexed) on a bucket.
 *
 * Previously a third "chat model" step lived here, storing
 * `default_llm_model` on the bucket. With P3 the chat model is an
 * agent concern — users create an agent (with its own model + system
 * prompt + bucket attachments) instead of configuring it per bucket.
 * Buckets only own retrieval-spec fields now.
 *
 * Credential check happens one level up (KnowledgeToggle) — this
 * modal doesn't even render when no active OpenAI key exists.
 */
export function EnableKnowledgeModal({
  open,
  status,
  busy,
  mode = "enable",
  onCancel,
  onConfirm,
}: Props) {
  const { data: me } = useMe();
  const { data: creds } = useProviderCredentials(me?.projects[0]?.id);
  const openai = (creds?.credentials ?? []).find(
    (c) => c.provider === "openai" && c.status === "active",
  );

  const isReindex = mode === "reindex";
  const initialEmbeddingId = findOptionId(
    status.settings?.embedding_model,
    status.settings?.embedding_dimensions,
  );

  const [step, setStep] = useState<Step>("embedding");
  const [embeddingId, setEmbeddingId] = useState<string>(
    isReindex ? initialEmbeddingId : DEFAULT_EMBEDDING_OPTION.id,
  );

  const embedding = useMemo<EmbeddingOption>(
    () =>
      EMBEDDING_OPTIONS.find((o) => o.id === embeddingId) ??
      DEFAULT_EMBEDDING_OPTION,
    [embeddingId],
  );

  const totalBytes = useMemo(() => {
    try {
      return BigInt(status.summary.total_bytes ?? "0");
    } catch {
      return 0n;
    }
  }, [status.summary.total_bytes]);

  const estimatedCostUsd = useMemo(
    () => estimateEmbeddingCostUsd(Number(totalBytes), embedding),
    [totalBytes, embedding],
  );

  if (!open) return null;

  const goConfirm = () =>
    void onConfirm({
      enabled: true,
      embedding_model: embedding.model,
      embedding_dimensions: embedding.dimensions,
    });

  const title = isReindex ? "Re-index Knowledge" : "Enable Knowledge";
  const ctaLabel = isReindex
    ? busy
      ? "Re-indexing…"
      : "Re-index now"
    : busy
      ? "Enabling…"
      : "Enable Knowledge";

  return (
    <Portal>
      <div
        className="ks-modal-scrim"
        onClick={busy ? undefined : onCancel}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="ks-modal"
          style={{ width: 600, maxWidth: "calc(100vw - 32px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ks-modal-head">
            <div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>{title}</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Step {step === "embedding" ? 1 : 2} of 2
              </div>
            </div>
            <IconButton name="x" label="Close" onClick={onCancel} disabled={busy} />
          </div>

          {openai ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: "var(--text-tertiary)",
                marginBottom: 16,
              }}
            >
              Using OpenAI key sk-…{openai.key_last_4} (project default).{" "}
              <Link href="/keys?tab=providers">Manage</Link>
            </div>
          ) : null}

          {step === "embedding" ? (
            <EmbeddingStep
              embeddingId={embeddingId}
              onChange={setEmbeddingId}
            />
          ) : (
            <ConfirmStep
              embedding={embedding}
              totalBytes={totalBytes}
              totalObjects={status.summary.total_objects}
              estimatedCostUsd={estimatedCostUsd}
              isReindex={isReindex}
              indexedChunks={status.summary.indexed}
            />
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 24,
            }}
          >
            {step === "embedding" ? (
              <>
                <Button variant="ghost" onClick={onCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="cta" onClick={() => setStep("confirm")}>
                  Continue
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setStep("embedding")}
                  disabled={busy}
                >
                  Back
                </Button>
                <Button
                  variant={isReindex ? "danger" : "cta"}
                  onClick={goConfirm}
                  loading={busy}
                >
                  {ctaLabel}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

function EmbeddingStep({
  embeddingId,
  onChange,
}: {
  embeddingId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Banner
        tone="warning"
        icon="alert"
        title="The embedding model is locked once indexing starts."
        body="Switching it later requires re-indexing every object in this bucket. The agent's chat model is configured separately and is free to swap."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {EMBEDDING_OPTIONS.map((opt) => {
          const selected = opt.id === embeddingId;
          const disabled = Boolean(opt.disabled);
          return (
            <label
              key={opt.id}
              data-selected={selected ? "true" : undefined}
              data-disabled={disabled ? "true" : undefined}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: 12,
                border: `1px solid ${selected ? "var(--krater)" : "var(--border)"}`,
                borderRadius: "var(--radius-md)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
                background: selected ? "var(--bg-elevated)" : "transparent",
              }}
            >
              <input
                type="radio"
                name="embedding-option"
                checked={selected}
                onChange={() => onChange(opt.id)}
                disabled={disabled}
                style={{ marginTop: 3 }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{opt.label}</span>
                  {opt.default ? <Pill tone="success">Recommended</Pill> : null}
                  {disabled ? <Pill tone="neutral">Coming soon</Pill> : null}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    marginTop: 4,
                  }}
                >
                  {opt.description}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    marginTop: 4,
                  }}
                >
                  ${opt.price_per_m_tokens_usd.toFixed(2)} / million tokens
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmStep({
  embedding,
  totalBytes,
  totalObjects,
  estimatedCostUsd,
  isReindex,
  indexedChunks,
}: {
  embedding: EmbeddingOption;
  totalBytes: bigint;
  totalObjects: number;
  estimatedCostUsd: number;
  isReindex: boolean;
  indexedChunks: number;
}) {
  const formattedCost =
    estimatedCostUsd < 0.01
      ? "< $0.01"
      : estimatedCostUsd < 1
        ? `$${estimatedCostUsd.toFixed(3)}`
        : `$${estimatedCostUsd.toFixed(2)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isReindex ? (
        <Banner
          tone="warning"
          icon="alert"
          title="This re-index is destructive."
          body={
            <>
              Existing chunks {indexedChunks > 0 ? `(${indexedChunks.toLocaleString()} indexed)` : ""} will be
              deleted before re-embedding begins. Search and chat return
              empty results for this bucket until the new pass completes.
            </>
          }
        />
      ) : null}
      <SummaryRow label="Provider" value="OpenAI" />
      <SummaryRow label="Embedding model" value={embedding.label} />
      <SummaryRow
        label="Bucket contents"
        value={`${totalObjects.toLocaleString()} object${totalObjects === 1 ? "" : "s"} · ${formatBytes(totalBytes)}`}
      />
      <SummaryRow
        label={isReindex ? "Estimated re-embedding cost" : "Estimated indexing cost"}
        value={
          <>
            <span>{formattedCost}</span>
            <span
              style={{
                marginLeft: 6,
                fontSize: 12,
                color: "var(--text-tertiary)",
              }}
            >
              one-time
            </span>
          </>
        }
        helper="Rough estimate using ~4 bytes per token. Actual usage may differ."
      />
      {!isReindex ? (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--bg-surface)",
          }}
        >
          <Icon
            name="info"
            size={14}
            style={{ color: "var(--text-secondary)", marginTop: 2 }}
          />
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            After Knowledge is on, head to{" "}
            <Link href="/agents">Agents</Link> to create a configured chat
            agent over this bucket. Each agent has its own system prompt,
            chat model, and audit trail.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  helper,
}: {
  label: string;
  value: React.ReactNode;
  helper?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(160px, 220px) 1fr",
        gap: 16,
        alignItems: "baseline",
        paddingBottom: 12,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="micro" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
      <div>
        <div style={{ fontSize: 14 }}>{value}</div>
        {helper ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-tertiary)",
              marginTop: 4,
            }}
          >
            {helper}
          </div>
        ) : null}
      </div>
    </div>
  );
}
