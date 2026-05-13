"use client";

import { useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type ProviderCredentialJson } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import { useProviderCredentials, useRemoveCredential } from "@/lib/queries";
import { AddOpenAiKeyDialog } from "./AddOpenAiKeyDialog";

interface Props {
  projectId: string | undefined;
}

const OPENAI_BLURB =
  "Used for embedding ingested objects and answering Knowledge questions. Required before enabling Knowledge on any bucket.";

export function ProviderCredentialsTab({ projectId }: Props) {
  const { show } = useToast();
  const { data, error, isLoading } = useProviderCredentials(projectId);
  const remove = useRemoveCredential(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [replacing, setReplacing] = useState<ProviderCredentialJson | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ProviderCredentialJson | null>(null);
  // Type-to-confirm is mandatory for every remove. The user must type
  // "remove" exactly — the confirm button stays disabled until they do.
  const [confirmText, setConfirmText] = useState("");

  const openai = (data?.credentials ?? []).find((c) => c.provider === "openai") ?? null;
  // Count of project buckets that will be cascade-disabled when the
  // credential is removed. Comes back on the list response so the
  // modal can pre-fill its copy without a roundtrip.
  const activeKnowledgeBuckets = data?.active_knowledge_buckets ?? 0;

  // Reset the type-to-confirm input each time the modal closes — never
  // carry a stale "remove" across attempts.
  useEffect(() => {
    if (confirmRemove === null) setConfirmText("");
  }, [confirmRemove]);

  const onAdd = () => {
    setReplacing(null);
    setDialogOpen(true);
  };
  const onReplace = (cred: ProviderCredentialJson) => {
    setReplacing(cred);
    setDialogOpen(true);
  };

  const onRemoveConfirm = async () => {
    if (!confirmRemove) return;
    if (confirmText.trim() !== "remove") return;
    try {
      // Always cascade. The CP transaction is a no-op for the chunk /
      // settings wipes when no buckets are active, and using a single
      // path avoids a round-trip-then-retry dance just to handle the
      // active-knowledge case.
      const res = await remove.mutateAsync({
        provider: confirmRemove.provider,
        cascade: true,
      });
      show({
        tone: "success",
        title: "OpenAI key removed",
        body:
          res.disabled_buckets > 0
            ? `Disabled Knowledge on ${res.disabled_buckets} bucket${res.disabled_buckets === 1 ? "" : "s"} and dropped every indexed chunk.`
            : "Indexing and search will fail until a new key is configured.",
      });
      setConfirmRemove(null);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't remove the key. Try again.";
      show({ tone: "error", title: "Remove failed", body: message });
    }
  };

  if (error) {
    return (
      <Banner
        tone="error"
        title="Failed to load AI providers"
        body={error instanceof ControlPlaneError ? error.message : "Try again in a moment."}
      />
    );
  }
  if (isLoading) {
    return <div className="muted" style={{ fontSize: 14 }}>Loading…</div>;
  }

  return (
    <>
      {openai ? (
        <Card style={{ padding: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 0, flex: "1 1 320px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 6,
                }}
              >
                <Icon name="key" size={16} style={{ color: "var(--text-secondary)" }} />
                <div style={{ fontWeight: 500 }}>OpenAI</div>
                {openai.status === "active" ? (
                  <Pill tone="success" dot>Active</Pill>
                ) : openai.status === "invalid" ? (
                  <Pill tone="error" dot>Invalid</Pill>
                ) : (
                  <Pill tone="neutral" dot>Revoked</Pill>
                )}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                sk-…{openai.key_last_4}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                {openai.last_validated
                  ? `Last validated ${formatRelative(openai.last_validated)}`
                  : "Awaiting validation"}
                {" · "}
                Added {formatRelative(openai.created_at)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Button variant="ghost" size="sm" onClick={() => onReplace(openai)}>
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmRemove(openai)}
                style={{ color: "var(--error)" }}
              >
                Remove
              </Button>
            </div>
          </div>
          <p
            className="lead"
            style={{ fontSize: 13, marginTop: 16, maxWidth: 640 }}
          >
            {OPENAI_BLURB}
          </p>
        </Card>
      ) : (
        <EmptyState
          icon="key"
          title="No OpenAI key configured"
          body={OPENAI_BLURB}
          action={
            <Button variant="cta" icon="plus" onClick={onAdd}>
              Add OpenAI key
            </Button>
          }
        />
      )}

      <AddOpenAiKeyDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        projectId={projectId}
        replacingLast4={replacing?.key_last_4 ?? null}
      />

      <ConfirmModal
        open={confirmRemove !== null}
        onCancel={() => (remove.isPending ? undefined : setConfirmRemove(null))}
        onConfirm={onRemoveConfirm}
        busy={remove.isPending}
        danger
        confirmLabel={
          remove.isPending
            ? "Removing…"
            : activeKnowledgeBuckets > 0
              ? "Remove and disable Knowledge"
              : "Remove key"
        }
        confirmDisabled={confirmText.trim() !== "remove"}
        title={
          activeKnowledgeBuckets > 0
            ? "This will disable Knowledge on every bucket"
            : "Remove OpenAI key?"
        }
        body={
          <>
            {activeKnowledgeBuckets > 0 ? (
              <p>
                Removing this key will disable Knowledge on{" "}
                <strong>
                  {activeKnowledgeBuckets} bucket
                  {activeKnowledgeBuckets === 1 ? "" : "s"}
                </strong>{" "}
                in this project and delete every indexed chunk. Manifests
                stay on chain for audit, but search and ask will return
                nothing until you re-enable Knowledge with a new key.
              </p>
            ) : (
              <p>
                Indexing jobs and Knowledge search will fail until you
                configure a new key. You can add a new key any time to
                restore both flows.
              </p>
            )}
            <p style={{ marginTop: 12 }}>
              Type <code>remove</code> below to confirm.
            </p>
            <Input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="remove"
              disabled={remove.isPending}
              style={{ marginTop: 8 }}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !remove.isPending &&
                  confirmText.trim() === "remove"
                ) {
                  void onRemoveConfirm();
                }
              }}
            />
          </>
        }
      />
    </>
  );
}
