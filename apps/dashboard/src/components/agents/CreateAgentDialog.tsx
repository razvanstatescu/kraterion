"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CHAT_MODELS, DEFAULT_CHAT_MODEL_ID } from "@kraterion/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Icon } from "@/components/ui/Icon";
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

type Step = "identity" | "model" | "buckets";

const DEFAULT_PROMPT = `You are a helpful assistant grounded in the user's Kraterion bucket. Answer the user's question using ONLY the retrieval context supplied after the dashed line. If the context doesn't cover the question, say so plainly instead of guessing.`;

/**
 * Three-step create flow:
 *   1. Identity   — name, description, system prompt.
 *   2. Model      — chat model picker.
 *   3. Knowledge  — attached buckets. Non-Knowledge buckets render
 *                   visible but disabled (the agent retrieves from
 *                   chunks; without Knowledge there's nothing to
 *                   retrieve from).
 *
 * Multi-step instead of one long scroll: each step fits the viewport
 * on small laptops, gives the user a clear sense of progress, and
 * matches the existing `EnableKnowledgeModal` shape so the pattern
 * is familiar.
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

  const [step, setStep] = useState<Step>("identity");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [model, setModel] = useState<string>(DEFAULT_CHAT_MODEL_ID);
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("identity");
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
  const identityValid = trimmedName.length > 0 && trimmedPrompt.length > 0;
  const canCreate = !busy && identityValid && Boolean(projectId);

  const toggleBucket = (id: string) => {
    setSelectedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!canCreate) return;
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
        body: "Open the Connect tab to grant the agent on-chain access to its buckets.",
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

  const stepNumber = step === "identity" ? 1 : step === "model" ? 2 : 3;

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
          style={{
            width: 600,
            maxWidth: "calc(100vw - 32px)",
            maxHeight: "calc(100vh - 32px)",
            display: "flex",
            flexDirection: "column",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ks-modal-head">
            <div>
              <div style={{ fontSize: 18, fontWeight: 500 }}>New agent</div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                Step {stepNumber} of 3 · {step === "identity" ? "Identity" : step === "model" ? "Chat model" : "Knowledge"}
              </div>
            </div>
            <IconButton name="x" label="Close" onClick={onClose} disabled={busy} />
          </div>

          {/* Body — scrolls if a step ever exceeds the viewport, but
              with 3 small steps it shouldn't on typical laptops. */}
          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {step === "identity" ? (
              <IdentityStep
                name={name}
                description={description}
                systemPrompt={systemPrompt}
                onNameChange={setName}
                onDescriptionChange={setDescription}
                onSystemPromptChange={setSystemPrompt}
                disabled={busy}
              />
            ) : step === "model" ? (
              <ModelStep model={model} onModelChange={setModel} disabled={busy} />
            ) : (
              <BucketsStep
                buckets={allBuckets}
                selectedBuckets={selectedBuckets}
                onToggle={toggleBucket}
                disabled={busy}
              />
            )}

            {error ? (
              <div style={{ marginTop: 12 }}>
                <Banner tone="error" title="Couldn't create the agent" body={error} />
              </div>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }}
          >
            <Button
              variant="ghost"
              onClick={step === "identity" ? onClose : () => setStep(prev => prev === "buckets" ? "model" : "identity")}
              disabled={busy}
            >
              {step === "identity" ? "Cancel" : "Back"}
            </Button>
            <div style={{ display: "flex", gap: 8 }}>
              {step === "buckets" ? (
                <Button
                  variant="cta"
                  onClick={onSubmit}
                  loading={busy}
                  disabled={!canCreate}
                >
                  {busy ? "Creating…" : "Create agent"}
                </Button>
              ) : (
                <Button
                  variant="cta"
                  onClick={() =>
                    setStep((prev) =>
                      prev === "identity" ? "model" : "buckets",
                    )
                  }
                  disabled={step === "identity" && !identityValid}
                >
                  Continue
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function IdentityStep({
  name,
  description,
  systemPrompt,
  onNameChange,
  onDescriptionChange,
  onSystemPromptChange,
  disabled,
}: {
  name: string;
  description: string;
  systemPrompt: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSystemPromptChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <FormField
        label="Name"
        helper="Used in the dashboard, audit rows, and the agent's URL. Editable later."
        required
      >
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="support-docs-bot"
          disabled={disabled}
        />
      </FormField>

      <FormField
        label="Description"
        helper="Optional. Shown in the agents list."
      >
        <Input
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Answers support questions over the public docs bucket."
          disabled={disabled}
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
          onChange={(e) => onSystemPromptChange(e.target.value)}
          rows={6}
          disabled={disabled}
          style={{ resize: "vertical", lineHeight: 1.55 }}
        />
      </FormField>
    </div>
  );
}

function ModelStep({
  model,
  onModelChange,
  disabled,
}: {
  model: string;
  onModelChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        Per-request override is allowed via the <code>model</code> field on{" "}
        <code>/chat/completions</code>. Free to swap later from the agent&apos;s
        settings.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        {CHAT_MODELS.map((m) => {
          const selected = m.id === model;
          return (
            <label
              key={m.id}
              style={{
                display: "flex",
                gap: 10,
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
                name="agent-model"
                checked={selected}
                onChange={() => onModelChange(m.id)}
                disabled={disabled}
                style={{ marginTop: 3 }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className="mono"
                    style={{ fontSize: 14, fontWeight: 500 }}
                  >
                    {m.label}
                  </span>
                  {m.default ? <Pill tone="success">Default</Pill> : null}
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
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function BucketsStep({
  buckets,
  selectedBuckets,
  onToggle,
  disabled,
}: {
  buckets: ReturnType<typeof useBuckets>["data"] extends infer T
    ? T extends { pages: { buckets: infer B }[] }
      ? B extends Array<infer Item>
        ? Item[]
        : never
      : never
    : never;
  selectedBuckets: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  // Sort: Knowledge-enabled first (selectable), then disabled buckets at
  // the bottom so the picker leads with what the user can actually pick.
  const sorted = useMemo(() => {
    return [...buckets].sort((a, b) => {
      const aOn = a.knowledge_enabled ? 1 : 0;
      const bOn = b.knowledge_enabled ? 1 : 0;
      if (aOn !== bOn) return bOn - aOn;
      return a.name.localeCompare(b.name);
    });
  }, [buckets]);

  const enabledCount = buckets.filter((b) => b.knowledge_enabled).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: 0,
          lineHeight: 1.55,
        }}
      >
        The agent retrieves from these at chat time. Only{" "}
        <strong>Knowledge-enabled</strong> buckets can be attached —
        without Knowledge there&apos;s nothing for the agent to retrieve
        from. You can also leave this empty and attach buckets later.
      </p>

      {buckets.length === 0 ? (
        <Banner
          tone="info"
          title="No buckets in this project yet"
          body={
            <>
              Create a bucket first, upload some files, and turn on
              Knowledge. <Link href="/buckets">Buckets →</Link>
            </>
          }
        />
      ) : enabledCount === 0 ? (
        <Banner
          tone="info"
          title="No buckets have Knowledge enabled yet"
          body={
            <>
              Pick a bucket on the <Link href="/buckets">buckets page</Link>{" "}
              and turn on Knowledge there. You can still create the agent
              now and attach buckets later.
            </>
          }
        />
      ) : null}

      {buckets.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            padding: 8,
          }}
        >
          {sorted.map((b) => {
            const checked = selectedBuckets.has(b.id);
            const knowledgeOn = Boolean(b.knowledge_enabled);
            return (
              <label
                key={b.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  cursor: !knowledgeOn || disabled ? "not-allowed" : "pointer",
                  background: checked ? "var(--bg-elevated)" : "transparent",
                  opacity: knowledgeOn ? 1 : 0.55,
                }}
                title={
                  knowledgeOn
                    ? undefined
                    : "Knowledge is off on this bucket. Enable it from the bucket's Knowledge tab to attach."
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(b.id)}
                  disabled={disabled || !knowledgeOn}
                />
                <Icon
                  name="bucket"
                  size={14}
                  style={{ color: "var(--text-secondary)" }}
                />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{b.name}</span>
                {!knowledgeOn ? (
                  <Pill tone="neutral">Knowledge off</Pill>
                ) : null}
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
      ) : null}
    </div>
  );
}
