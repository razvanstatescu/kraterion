"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID } from "@kraterion/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { Portal } from "@/components/ui/Portal";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError } from "@/lib/api";
import { useBuckets, useCreateAgent } from "@/lib/queries";

interface Props {
  open: boolean;
  projectId: string | undefined;
  onClose: () => void;
  /** Preselect a single bucket — used when creating an agent from a
   *  bucket's Knowledge tab. The user can still tick / untick others. */
  initialBucketId?: string;
}

const DEFAULT_PROMPT = `You are a helpful assistant grounded in the user's Kraterion bucket. Answer the user's question using ONLY the retrieval context supplied after the dashed line. If the context doesn't cover the question, say so plainly instead of guessing.`;

/**
 * Single-screen create flow. We keep it on one screen (vs. the
 * multi-step `EnableKnowledgeModal`) because nothing here is locked
 * post-create — every field is editable on the detail page after
 * the agent exists.
 */
export function CreateAgentDialog({
  open,
  projectId,
  onClose,
  initialBucketId,
}: Props) {
  const router = useRouter();
  const { show } = useToast();
  const { data: bucketsData } = useBuckets({
    projectId: projectId ?? undefined,
    limit: 100,
  });
  const allBuckets = useMemo(
    () => bucketsData?.pages.flatMap((p) => p.buckets) ?? [],
    [bucketsData],
  );

  const create = useCreateAgent(projectId);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [model, setModel] = useState<string>(DEFAULT_CHAT_MODEL_ID);
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Reset on open so the dialog is fresh between attempts.
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setSystemPrompt(DEFAULT_PROMPT);
      setModel(DEFAULT_CHAT_MODEL_ID);
      setSelectedBuckets(new Set(initialBucketId ? [initialBucketId] : []));
      setError(null);
    }
  }, [open, initialBucketId]);

  if (!open) return null;

  const busy = create.isPending;
  const trimmedName = name.trim();
  const trimmedPrompt = systemPrompt.trim();
  const canSubmit =
    !busy && trimmedName.length > 0 && trimmedPrompt.length > 0 && Boolean(projectId);

  const toggleBucket = (id: string) => {
    setSelectedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      const payload = {
        name: trimmedName,
        ...(description.trim() ? { description: description.trim() } : {}),
        system_prompt: trimmedPrompt,
        model,
        bucket_ids: Array.from(selectedBuckets),
      };
      const res = await create.mutateAsync(payload);
      show({
        tone: "success",
        title: `Agent "${res.agent.name}" created`,
        body: "You can chat with it on the agent's detail page.",
      });
      onClose();
      router.push(`/agents/${res.agent.id}`);
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create the agent. Try again.";
      setError(message);
    }
  };

  return (
    <Portal>
      <div
        className="ks-modal-scrim"
        onClick={busy ? undefined : onClose}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="ks-modal"
          style={{ width: 640, maxWidth: "calc(100vw - 32px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ks-modal-head">
            <div style={{ fontSize: 18, fontWeight: 500 }}>New agent</div>
            <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <FormField
              label="Name"
              helper="Used in the dashboard, audit rows, and the agent's URL. Editable later."
              required
            >
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="support-docs-bot"
                disabled={busy}
              />
            </FormField>

            <FormField
              label="Description"
              helper="Optional. Shown in the agents list."
            >
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Answers support questions over the public docs bucket."
                disabled={busy}
              />
            </FormField>

            <FormField
              label="System prompt"
              helper="Wraps the retrieval context at chat time. Editable later."
              required
            >
              <textarea
                className="input"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                disabled={busy}
                style={{ resize: "vertical", lineHeight: 1.55 }}
              />
            </FormField>

            <FormField
              label="Chat model"
              helper="Per-request override is allowed via the `model` field on /chat/completions."
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr",
                  gap: 8,
                }}
              >
                {CHAT_MODELS.map((m) => {
                  const selected = m.id === model;
                  return (
                    <label
                      key={m.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: 10,
                        border: `1px solid ${selected ? "var(--krater)" : "var(--border)"}`,
                        borderRadius: "var(--radius-md)",
                        cursor: "pointer",
                        background: selected
                          ? "var(--bg-elevated)"
                          : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="agent-model"
                        checked={selected}
                        onChange={() => setModel(m.id)}
                        disabled={busy}
                        style={{ marginTop: 2 }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span
                            className="mono"
                            style={{ fontSize: 13, fontWeight: 500 }}
                          >
                            {m.label}
                          </span>
                          {m.default ? <Pill tone="success">Default</Pill> : null}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-secondary)",
                            marginTop: 2,
                          }}
                        >
                          {m.description}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </FormField>

            <FormField
              label="Attached buckets"
              helper="The agent retrieves from these at chat time. You can also leave this empty and attach buckets later."
            >
              {allBuckets.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  No buckets in this project yet.
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    maxHeight: 200,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: 8,
                  }}
                >
                  {allBuckets.map((b) => {
                    const checked = selectedBuckets.has(b.id);
                    return (
                      <label
                        key={b.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "6px 8px",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          background: checked
                            ? "var(--bg-elevated)"
                            : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBucket(b.id)}
                          disabled={busy}
                        />
                        <span style={{ fontSize: 13 }}>{b.name}</span>
                        <span
                          className="muted"
                          style={{ fontSize: 12, marginLeft: "auto" }}
                        >
                          {b.region}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </FormField>

            {error ? (
              <Banner tone="error" title="Couldn't create the agent" body={error} />
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="cta"
                onClick={onSubmit}
                loading={busy}
                disabled={!canSubmit}
              >
                {busy ? "Creating…" : "Create agent"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
