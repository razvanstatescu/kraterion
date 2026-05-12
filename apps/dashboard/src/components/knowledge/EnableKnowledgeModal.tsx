"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_EMBEDDING_OPTION,
  EMBEDDING_OPTIONS,
  estimateEmbeddingCostUsd,
  type EmbeddingOption,
} from "@kraterion/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Pill } from "@/components/ui/Pill";
import { formatBytes } from "@/lib/format";
import { useMe, useProviderCredentials, type KnowledgeStatus } from "@/lib/queries";
import type { ToggleKnowledgePayload } from "@/lib/queries";

interface Props {
  open: boolean;
  status: KnowledgeStatus;
  busy: boolean;
  /** "enable" (default) is the first-time flow. "reindex" is the
   *  destructive change-settings flow: pre-fills the pickers from
   *  current settings, swaps copy + button labels, and the confirm
   *  step shows the destructive banner. Both modes hit the same
   *  picker components. */
  mode?: "enable" | "reindex";
  onCancel: () => void;
  onConfirm: (payload: ToggleKnowledgePayload) => void | Promise<void>;
}

type Step = "embedding" | "chat" | "confirm";

function findOptionId(model?: string, dims?: number): string {
  if (!model || !dims) return DEFAULT_EMBEDDING_OPTION.id;
  return (
    EMBEDDING_OPTIONS.find((o) => o.model === model && o.dimensions === dims)?.id ??
    DEFAULT_EMBEDDING_OPTION.id
  );
}

/**
 * Multi-step modal that captures the user's picks before Knowledge is
 * enabled on a bucket. Replaces the bare "Enable Knowledge" button.
 *
 * Steps:
 *   1. Embedding model — radio with a warning that it's locked once
 *      indexing starts. Only the 1024d option is selectable today
 *      because the pgvector column is fixed at halfvec(1024); the
 *      others are visible so the future trade-off is discoverable.
 *   2. Default chat model — picker stored on the bucket. Callers can
 *      override per request.
 *   3. Confirm — summary line + indexing-cost estimate computed from
 *      the bucket's total bytes × the embedding option's per-million
 *      price.
 *
 * Credential check is done one level up (KnowledgeToggle) — we don't
 * even render this modal when no active OpenAI key exists.
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
  const initialChatModelId =
    status.settings?.default_llm_model ?? DEFAULT_CHAT_MODEL_ID;

  const [step, setStep] = useState<Step>("embedding");
  const [embeddingId, setEmbeddingId] = useState<string>(
    isReindex ? initialEmbeddingId : DEFAULT_EMBEDDING_OPTION.id,
  );
  const [chatModelId, setChatModelId] = useState<string>(
    isReindex ? initialChatModelId : DEFAULT_CHAT_MODEL_ID,
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
      default_llm_model: chatModelId,
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
              Step {step === "embedding" ? 1 : step === "chat" ? 2 : 3} of 3
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
        ) : step === "chat" ? (
          <ChatStep chatModelId={chatModelId} onChange={setChatModelId} />
        ) : (
          <ConfirmStep
            embedding={embedding}
            chatModelId={chatModelId}
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
              <Button variant="cta" onClick={() => setStep("chat")}>
                Continue
              </Button>
            </>
          ) : step === "chat" ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("embedding")}
                disabled={busy}
              >
                Back
              </Button>
              <Button variant="cta" onClick={() => setStep("confirm")}>
                Continue
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setStep("chat")}
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
        body="Switching it later requires re-indexing every object in this bucket. Switching the chat model is free and per-request."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {EMBEDDING_OPTIONS.map((opt) => {
          const selected = opt.id === embeddingId;
          const disabled = Boolean(opt.disabled);
          return (
            <label
              key={opt.id}
              className="ks-radio-row"
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
                  {opt.default ? (
                    <Pill tone="success">Recommended</Pill>
                  ) : null}
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

function ChatStep({
  chatModelId,
  onChange,
}: {
  chatModelId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
        Default model for the bucket&apos;s <code>/ask</code> endpoint. Callers
        can still override per request.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {CHAT_MODELS.map((m) => {
          const selected = m.id === chatModelId;
          return (
            <label
              key={m.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: 12,
                border: `1px solid ${selected ? "var(--krater)" : "var(--border)"}`,
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
                background: selected ? "var(--bg-elevated)" : "transparent",
              }}
            >
              <input
                type="radio"
                name="chat-model"
                checked={selected}
                onChange={() => onChange(m.id)}
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
                  <span
                    className="mono"
                    style={{ fontWeight: 500, fontSize: 14 }}
                  >
                    {m.label}
                  </span>
                  {m.default ? <Pill tone="success">Recommended</Pill> : null}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    marginTop: 4,
                  }}
                >
                  {m.description}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    marginTop: 4,
                  }}
                >
                  ~${m.price_per_m_tokens_usd.toFixed(2)} / million output tokens
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
  chatModelId,
  totalBytes,
  totalObjects,
  estimatedCostUsd,
  isReindex,
  indexedChunks,
}: {
  embedding: EmbeddingOption;
  chatModelId: string;
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
              deleted before re-embedding begins. Search and ask return
              empty results for this bucket until the new pass completes.
              Manifests stay on chain for audit but their hashes no longer
              match live chunks until re-indexing finishes.
            </>
          }
        />
      ) : null}
      <SummaryRow label="Provider" value="OpenAI" />
      <SummaryRow label="Embedding model" value={embedding.label} />
      <SummaryRow label="Default chat model" value={chatModelId} />
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
