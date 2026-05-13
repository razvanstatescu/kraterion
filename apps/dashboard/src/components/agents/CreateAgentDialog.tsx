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
import { AGENT_TOOL_CATALOG } from "@/lib/agent-tools";
import { useBuckets, useCreateAgent } from "@/lib/queries";
import { useSponsoredTx } from "@/lib/sponsor";

interface Props {
  open: boolean;
  projectId: string | undefined;
  onClose: () => void;
  /** Preselect a single bucket — used when creating an agent from a
   *  bucket's Knowledge tab. The user can still tick / untick others. */
  initialBucketId?: string;
}

type Step = "identity" | "model" | "buckets" | "tools";

const STEP_LABELS: Record<Step, string> = {
  identity: "Identity",
  model: "Chat model",
  buckets: "Knowledge",
  tools: "Tools",
};

const STEP_ORDER: readonly Step[] = ["identity", "model", "buckets", "tools"];

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
  const runSponsored = useSponsoredTx();

  // Per-bucket grant progress after the agent is minted. We're firing
  // one sponsored Move tx per attached bucket (Enoki caps a sponsored
  // PTB to a single Move-call allow-list — see decisions.md 2026-05-13
  // "agent sub-wallet" — so batching isn't an option here).
  //
  // Each row is the bucket id paired with its current state. We hold
  // the agent's name on the granting state for the toast/title only.
  type GrantStatus =
    | { kind: "pending" }
    | { kind: "running" }
    | { kind: "success"; digest: string }
    | { kind: "failed"; message: string };
  const [grants, setGrants] = useState<Record<string, GrantStatus>>({});
  const [grantPhase, setGrantPhase] = useState<
    | { kind: "idle" }
    | { kind: "running"; agentId: string; agentName: string; bucketsRemaining: number }
    | { kind: "done"; agentId: string }
  >({ kind: "idle" });

  const [step, setStep] = useState<Step>("identity");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [model, setModel] = useState<string>(DEFAULT_CHAT_MODEL_ID);
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(new Set());
  // Default to the safe read tools (search + list). Write tools require
  // an explicit opt-in because they emit on-chain receipts and (modestly)
  // cost the user's pre-funded WAL pool.
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(["kraterion_search", "kraterion_list_objects"]),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("identity");
      setName("");
      setDescription("");
      setSystemPrompt(DEFAULT_PROMPT);
      setModel(DEFAULT_CHAT_MODEL_ID);
      setSelectedBuckets(new Set(initialBucketId ? [initialBucketId] : []));
      setSelectedTools(new Set(["kraterion_search", "kraterion_list_objects"]));
      setError(null);
      setGrants({});
      setGrantPhase({ kind: "idle" });
    }
  }, [open, initialBucketId]);

  // Bucket id → display name. Used by the progress UI to label rows
  // without re-fetching once the agent is created. Must sit above the
  // `if (!open) return null` early return — otherwise hooks below the
  // guard fire conditionally and React throws on a hook-order change.
  const bucketNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of allBuckets) m.set(b.id, b.name);
    return m;
  }, [allBuckets]);

  if (!open) return null;

  // Busy includes the post-create grant loop so the dialog can't be
  // dismissed mid-flight (the loop's per-bucket signatures are user
  // interactions; closing the dialog mid-loop would orphan the agent
  // with partial on-chain grants — recoverable via the Connect tab,
  // but bad UX to surprise the user with).
  const busy = create.isPending || grantPhase.kind === "running";
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

  const toggleTool = (name: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const onSubmit = async () => {
    if (!canCreate) return;
    setError(null);

    // === Phase 1: create the agent server-side ===
    let agent;
    try {
      const payload = {
        name: trimmedName,
        ...(description.trim() ? { description: description.trim() } : {}),
        system_prompt: trimmedPrompt,
        model,
        bucket_ids: Array.from(selectedBuckets),
        tools: Array.from(selectedTools),
      };
      const res = await create.mutateAsync(payload);
      agent = res.agent;
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't create the agent. Try again.";
      setError(message);
      return;
    }

    // No buckets attached → nothing to grant. Toast + route.
    const bucketIds = Array.from(selectedBuckets);
    if (bucketIds.length === 0) {
      show({
        tone: "success",
        title: `Agent "${agent.name}" created`,
        body: "Attach a bucket from the Settings tab when you're ready.",
      });
      onClose();
      router.push(`/agents/${agent.id}`);
      return;
    }

    // === Phase 2: sequential per-bucket on-chain grants ===
    //
    // One sponsored Move tx per (agent × bucket). Each tx requires one
    // wallet signature — Enoki sponsors gas but the user's session key
    // signs the PTB. We loop sequentially because (a) the Mysten
    // sign-transaction hook is a single in-flight mutation, and (b)
    // back-to-back prompts confuse users less than parallel popups.
    //
    // A failure in one grant does NOT abort the others — the agent
    // exists; pending buckets stay "Pending" on the Connect tab and
    // the user can retry from there.
    setGrants(
      Object.fromEntries(bucketIds.map((id) => [id, { kind: "pending" }])),
    );
    setGrantPhase({
      kind: "running",
      agentId: agent.id,
      agentName: agent.name,
      bucketsRemaining: bucketIds.length,
    });

    let successCount = 0;
    let failureCount = 0;
    for (const bucketId of bucketIds) {
      setGrants((prev) => ({ ...prev, [bucketId]: { kind: "running" } }));
      try {
        const res = await runSponsored({
          prepareEndpoint: `/v1/buckets/${bucketId}/prepare-grant-agent`,
          body: { agent_id: agent.id },
        });
        setGrants((prev) => ({
          ...prev,
          [bucketId]: { kind: "success", digest: res.digest },
        }));
        successCount++;
      } catch (err) {
        const message =
          err instanceof ControlPlaneError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Sponsored grant failed.";
        setGrants((prev) => ({
          ...prev,
          [bucketId]: { kind: "failed", message },
        }));
        failureCount++;
      }
      setGrantPhase((prev) =>
        prev.kind === "running"
          ? { ...prev, bucketsRemaining: prev.bucketsRemaining - 1 }
          : prev,
      );
    }

    setGrantPhase({ kind: "done", agentId: agent.id });

    if (failureCount === 0) {
      show({
        tone: "success",
        title: `Agent "${agent.name}" created`,
        body: `Granted on-chain access on ${successCount} ${successCount === 1 ? "bucket" : "buckets"}.`,
      });
    } else {
      show({
        tone: "warning",
        title: `Agent "${agent.name}" created with partial access`,
        body: `${successCount} granted, ${failureCount} failed. Retry the failed ones from the Connect tab.`,
      });
    }
  };

  const dismissAfterGrants = () => {
    if (grantPhase.kind !== "done") return;
    const agentId = grantPhase.agentId;
    onClose();
    router.push(`/agents/${agentId}`);
  };

  const stepNumber = STEP_ORDER.indexOf(step) + 1;
  const isLastStep = step === STEP_ORDER[STEP_ORDER.length - 1];
  const prevStep = (): Step => STEP_ORDER[Math.max(0, STEP_ORDER.indexOf(step) - 1)]!;
  const nextStep = (): Step =>
    STEP_ORDER[Math.min(STEP_ORDER.length - 1, STEP_ORDER.indexOf(step) + 1)]!;

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
              <div style={{ fontSize: 18, fontWeight: 500 }}>
                {grantPhase.kind === "idle"
                  ? "New agent"
                  : grantPhase.kind === "running"
                    ? "Granting on-chain access"
                    : "Agent ready"}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {grantPhase.kind === "idle"
                  ? `Step ${stepNumber} of ${STEP_ORDER.length} · ${STEP_LABELS[step]}`
                  : grantPhase.kind === "running"
                    ? `Signing one sponsored tx per bucket. ${grantPhase.bucketsRemaining} remaining.`
                    : "Review the on-chain grants and open the agent."}
              </div>
            </div>
            <IconButton
              name="x"
              label="Close"
              onClick={grantPhase.kind === "done" ? dismissAfterGrants : onClose}
              disabled={busy}
            />
          </div>

          <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
            {grantPhase.kind === "idle" ? (
              <>
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
                  <ModelStep
                    model={model}
                    onModelChange={setModel}
                    disabled={busy}
                  />
                ) : step === "buckets" ? (
                  <BucketsStep
                    buckets={allBuckets}
                    selectedBuckets={selectedBuckets}
                    onToggle={toggleBucket}
                    disabled={busy}
                  />
                ) : (
                  <ToolsStep
                    selectedTools={selectedTools}
                    onToggle={toggleTool}
                    disabled={busy}
                  />
                )}

                {error ? (
                  <div style={{ marginTop: 12 }}>
                    <Banner
                      tone="error"
                      title="Couldn't create the agent"
                      body={error}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <GrantProgress
                grants={grants}
                bucketIds={Array.from(selectedBuckets)}
                bucketNameById={bucketNameById}
              />
            )}
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
            {grantPhase.kind === "idle" ? (
              <>
                <Button
                  variant="ghost"
                  onClick={step === "identity" ? onClose : () => setStep(prevStep())}
                  disabled={busy}
                >
                  {step === "identity" ? "Cancel" : "Back"}
                </Button>
                <div style={{ display: "flex", gap: 8 }}>
                  {isLastStep ? (
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
                      onClick={() => setStep(nextStep())}
                      disabled={step === "identity" && !identityValid}
                    >
                      Continue
                    </Button>
                  )}
                </div>
              </>
            ) : (
              // Grant phase — no Back. Close is the only exit, and is
              // disabled until the loop drains.
              <>
                <span />
                <Button
                  variant="cta"
                  onClick={dismissAfterGrants}
                  disabled={grantPhase.kind !== "done"}
                >
                  {grantPhase.kind === "running"
                    ? "Signing…"
                    : "Open agent"}
                </Button>
              </>
            )}
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

function ToolsStep({
  selectedTools,
  onToggle,
  disabled,
}: {
  selectedTools: Set<string>;
  onToggle: (name: string) => void;
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
        Pick what this agent can do beyond plain RAG. Read tools are
        safe by default; write tools mint an on-chain Move tx and
        spend the bucket&apos;s pre-funded WAL pool.
      </p>

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
        {AGENT_TOOL_CATALOG.map((tool) => {
          const checked = selectedTools.has(tool.name);
          const isWrite = tool.kind === "write";
          return (
            <label
              key={tool.name}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                cursor: disabled ? "not-allowed" : "pointer",
                background: checked ? "var(--bg-elevated)" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(tool.name)}
                disabled={disabled}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <Icon
                name={tool.icon}
                size={16}
                style={{ color: "var(--text-secondary)", flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {tool.label}
                  </span>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--text-tertiary)" }}
                  >
                    {tool.name}
                  </span>
                  {isWrite ? (
                    <Pill tone="warning">Write · on-chain receipt</Pill>
                  ) : (
                    <Pill tone="neutral">Read</Pill>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    marginTop: 4,
                  }}
                >
                  {tool.description}
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

/**
 * Per-bucket grant status, rendered while the dialog's grant loop
 * walks through the attached buckets. One row per bucket; dot tone
 * tracks state (pending / running / done / failed). On failure we
 * surface the error inline + tell the user where to retry from.
 */
function GrantProgress({
  grants,
  bucketIds,
  bucketNameById,
}: {
  grants: Record<
    string,
    | { kind: "pending" }
    | { kind: "running" }
    | { kind: "success"; digest: string }
    | { kind: "failed"; message: string }
  >;
  bucketIds: string[];
  bucketNameById: Map<string, string>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p
        className="muted"
        style={{ fontSize: 13, margin: 0, lineHeight: 1.55 }}
      >
        Each bucket needs a separate sponsored Move tx (Enoki caps a
        sponsored PTB to one Move-call target). You&apos;ll see one
        wallet-signature prompt per bucket. Failed grants can be retried
        from the agent&apos;s Connect tab.
      </p>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          padding: 6,
        }}
      >
        {bucketIds.map((id) => {
          const state = grants[id] ?? { kind: "pending" as const };
          const name = bucketNameById.get(id) ?? id;
          const dotColor =
            state.kind === "success"
              ? "var(--success)"
              : state.kind === "failed"
                ? "var(--error)"
                : state.kind === "running"
                  ? "var(--krater)"
                  : "var(--text-tertiary)";
          const label =
            state.kind === "success"
              ? "Granted"
              : state.kind === "failed"
                ? "Failed"
                : state.kind === "running"
                  ? "Signing…"
                  : "Pending";
          return (
            <div
              key={id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                background:
                  state.kind === "running"
                    ? "var(--bg-elevated)"
                    : "transparent",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: dotColor,
                  marginTop: 7,
                  flexShrink: 0,
                  // Pulse the running dot so the user can tell which row
                  // is waiting on their signature.
                  animation:
                    state.kind === "running"
                      ? "ks-pulse 1.2s ease-in-out infinite"
                      : "none",
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{name}</span>
                  <span
                    className="muted"
                    style={{ fontSize: 12, marginLeft: "auto" }}
                  >
                    {label}
                  </span>
                </div>
                {state.kind === "failed" ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--error)",
                      marginTop: 4,
                    }}
                  >
                    {state.message}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
