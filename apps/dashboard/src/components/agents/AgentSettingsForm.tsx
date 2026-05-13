"use client";

import { useEffect, useMemo, useState } from "react";
import { CHAT_MODELS } from "@kraterion/shared";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Pill } from "@/components/ui/Pill";
import { useToast } from "@/components/ui/Toast";
import { ControlPlaneError, type AgentJson } from "@/lib/api";
import { AGENT_TOOL_CATALOG } from "@/lib/agent-tools";
import { Icon } from "@/components/ui/Icon";
import { useBuckets, useUpdateAgent } from "@/lib/queries";

interface Props {
  agent: AgentJson;
}

/**
 * In-place settings form on the agent detail page. Edits to any field
 * are kept local until the user hits Save; the form gains a Save / Reset
 * footer when the local state diverges from the server. Same shape as
 * the bucket Knowledge tab — small, dense, sentence case.
 */
export function AgentSettingsForm({ agent }: Props) {
  const { show } = useToast();
  const update = useUpdateAgent(agent.id, agent.project_id);
  const { data: bucketsData } = useBuckets({
    projectId: agent.project_id,
    limit: 100,
  });
  const allBuckets = useMemo(
    () => bucketsData?.pages.flatMap((p) => p.buckets) ?? [],
    [bucketsData],
  );

  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt);
  const [model, setModel] = useState(agent.model);
  const [temperature, setTemperature] = useState(agent.temperature);
  const [maxTokens, setMaxTokens] = useState(agent.max_tokens);
  const [topK, setTopK] = useState(agent.top_k);
  const [selectedBuckets, setSelectedBuckets] = useState<Set<string>>(
    new Set(agent.bucket_ids),
  );
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(agent.tools),
  );
  const [error, setError] = useState<string | null>(null);

  // When the agent prop changes (e.g. after Save), reset local state to
  // match. Otherwise stale local values overwrite server-truth.
  useEffect(() => {
    setName(agent.name);
    setDescription(agent.description ?? "");
    setSystemPrompt(agent.system_prompt);
    setModel(agent.model);
    setTemperature(agent.temperature);
    setMaxTokens(agent.max_tokens);
    setTopK(agent.top_k);
    setSelectedBuckets(new Set(agent.bucket_ids));
    setSelectedTools(new Set(agent.tools));
  }, [agent]);

  const bucketIdsArray = useMemo(
    () => Array.from(selectedBuckets).sort(),
    [selectedBuckets],
  );
  const serverBuckets = useMemo(
    () => [...agent.bucket_ids].sort(),
    [agent.bucket_ids],
  );
  const toolsArray = useMemo(
    () => Array.from(selectedTools).sort(),
    [selectedTools],
  );
  const serverTools = useMemo(() => [...agent.tools].sort(), [agent.tools]);
  const dirty =
    name !== agent.name ||
    description !== (agent.description ?? "") ||
    systemPrompt !== agent.system_prompt ||
    model !== agent.model ||
    temperature !== agent.temperature ||
    maxTokens !== agent.max_tokens ||
    topK !== agent.top_k ||
    bucketIdsArray.join(",") !== serverBuckets.join(",") ||
    toolsArray.join(",") !== serverTools.join(",");

  const reset = () => {
    setName(agent.name);
    setDescription(agent.description ?? "");
    setSystemPrompt(agent.system_prompt);
    setModel(agent.model);
    setTemperature(agent.temperature);
    setMaxTokens(agent.max_tokens);
    setTopK(agent.top_k);
    setSelectedBuckets(new Set(agent.bucket_ids));
    setSelectedTools(new Set(agent.tools));
    setError(null);
  };

  const save = async () => {
    setError(null);
    try {
      const payload: Parameters<typeof update.mutateAsync>[0] = {};
      if (name !== agent.name) payload.name = name.trim();
      if (description !== (agent.description ?? ""))
        payload.description = description.trim() || null;
      if (systemPrompt !== agent.system_prompt)
        payload.system_prompt = systemPrompt;
      if (model !== agent.model) payload.model = model;
      if (temperature !== agent.temperature) payload.temperature = temperature;
      if (maxTokens !== agent.max_tokens) payload.max_tokens = maxTokens;
      if (topK !== agent.top_k) payload.top_k = topK;
      if (bucketIdsArray.join(",") !== serverBuckets.join(","))
        payload.bucket_ids = bucketIdsArray;
      if (toolsArray.join(",") !== serverTools.join(","))
        payload.tools = toolsArray;
      await update.mutateAsync(payload);
      show({ tone: "success", title: "Agent updated" });
    } catch (err) {
      const message =
        err instanceof ControlPlaneError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Couldn't save changes.";
      setError(message);
    }
  };

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

  const busy = update.isPending;
  const readonly = agent.status === "revoked";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {readonly ? (
        <Banner
          tone="warning"
          title="This agent is revoked"
          body="Edits are disabled. Restore the agent or create a new one to make changes."
        />
      ) : null}

      <FormField label="Name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy || readonly}
        />
      </FormField>

      <FormField label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
          disabled={busy || readonly}
        />
      </FormField>

      <FormField
        label="System prompt"
        helper="Wraps the retrieval context at chat time."
        required
      >
        <textarea
          className="input"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          disabled={busy || readonly}
          style={{ resize: "vertical", lineHeight: 1.55 }}
        />
      </FormField>

      <FormField label="Chat model">
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
                  padding: 10,
                  border: `1px solid ${selected ? "var(--krater)" : "var(--border)"}`,
                  borderRadius: "var(--radius-md)",
                  cursor: readonly ? "not-allowed" : "pointer",
                  background: selected ? "var(--bg-elevated)" : "transparent",
                  opacity: readonly ? 0.55 : 1,
                }}
              >
                <input
                  type="radio"
                  name="agent-model"
                  checked={selected}
                  onChange={() => setModel(m.id)}
                  disabled={busy || readonly}
                  style={{ marginTop: 2 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <FormField label="Temperature" helper="0.0 = deterministic.">
          <Input
            type="number"
            step={0.1}
            min={0}
            max={2}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            disabled={busy || readonly}
          />
        </FormField>
        <FormField label="Max tokens" helper="Per response cap.">
          <Input
            type="number"
            step={64}
            min={1}
            max={8192}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            disabled={busy || readonly}
          />
        </FormField>
        <FormField label="Retrieval top-k" helper="Chunks pulled per turn.">
          <Input
            type="number"
            step={1}
            min={1}
            max={32}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value))}
            disabled={busy || readonly}
          />
        </FormField>
      </div>

      <FormField
        label="Attached buckets"
        helper="The agent retrieves from these buckets at chat time. Only Knowledge-enabled buckets contribute retrieval; a bucket with Knowledge off stays attached but is silently skipped during chat."
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
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: 8,
            }}
          >
            {[...allBuckets]
              .sort((a, b) => {
                const aOn = a.knowledge_enabled ? 1 : 0;
                const bOn = b.knowledge_enabled ? 1 : 0;
                if (aOn !== bOn) return bOn - aOn;
                return a.name.localeCompare(b.name);
              })
              .map((b) => {
              const checked = selectedBuckets.has(b.id);
              const knowledgeOn = Boolean(b.knowledge_enabled);
              const lockedForAttach = !knowledgeOn && !checked;
              return (
                <label
                  key={b.id}
                  title={
                    lockedForAttach
                      ? "Knowledge is off on this bucket. Enable it from the bucket's Knowledge tab to attach."
                      : !knowledgeOn && checked
                        ? "Knowledge is off; the agent silently skips this bucket. Detach if no longer needed."
                        : undefined
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 8px",
                    borderRadius: "var(--radius-sm)",
                    cursor:
                      readonly || lockedForAttach ? "not-allowed" : "pointer",
                    background: checked ? "var(--bg-elevated)" : "transparent",
                    opacity: knowledgeOn ? 1 : 0.7,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleBucket(b.id)}
                    disabled={busy || readonly || lockedForAttach}
                  />
                  <span style={{ fontSize: 13 }}>{b.name}</span>
                  {!knowledgeOn ? (
                    <Pill tone={checked ? "warning" : "neutral"}>
                      Knowledge off
                    </Pill>
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
        )}
      </FormField>

      <FormField
        label="Tools"
        helper="Built-in tools the agent can invoke. Write tools mint an on-chain Move tx; reads are safe by default."
      >
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
                  cursor: busy ? "not-allowed" : "pointer",
                  background: checked ? "var(--bg-elevated)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleTool(tool.name)}
                  disabled={busy}
                  style={{ marginTop: 3, flexShrink: 0 }}
                />
                <Icon
                  name={tool.icon}
                  size={16}
                  style={{
                    color: "var(--text-secondary)",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
      </FormField>

      {error ? (
        <Banner tone="error" title="Couldn't save changes" body={error} />
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          paddingTop: 8,
          borderTop: dirty ? "1px solid var(--border)" : "none",
        }}
      >
        {dirty ? (
          <>
            <Button variant="ghost" onClick={reset} disabled={busy}>
              Discard
            </Button>
            <Button variant="cta" onClick={save} loading={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
