-- P4 — Agent tools (built-in tool dispatch + per-tool-call audit).
-- Additive: existing agents land with zero AgentTool rows (no tools
-- enabled); existing invocations have no children in AgentToolCall.

CREATE TABLE "AgentTool" (
  "agent_id"   TEXT NOT NULL,
  "tool_name"  TEXT NOT NULL,
  "tool_kind"  TEXT NOT NULL DEFAULT 'builtin',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AgentTool_pkey" PRIMARY KEY ("agent_id", "tool_name")
);

CREATE INDEX "AgentTool_agent_id_idx" ON "AgentTool"("agent_id");

ALTER TABLE "AgentTool"
  ADD CONSTRAINT "AgentTool_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "KraterionAgent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AgentToolCall" (
  "id"                    TEXT NOT NULL,
  "invocation_id"         TEXT NOT NULL,
  "tool_call_id"          TEXT NOT NULL,
  "tool_name"             TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'pending',
  "round"                 INTEGER NOT NULL,
  "arguments"             TEXT NOT NULL,
  "output"                TEXT,
  "output_json"           JSONB,
  "tx_digest"             TEXT,
  "walrus_blob_id"        TEXT,
  "shared_blob_object_id" TEXT,
  "latency_ms"            INTEGER,
  "error_detail"          TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at"           TIMESTAMP(3),

  CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentToolCall_invocation_id_tool_call_id_key"
  ON "AgentToolCall"("invocation_id", "tool_call_id");
CREATE INDEX "AgentToolCall_invocation_id_created_at_idx"
  ON "AgentToolCall"("invocation_id", "created_at");

ALTER TABLE "AgentToolCall"
  ADD CONSTRAINT "AgentToolCall_invocation_id_fkey"
  FOREIGN KEY ("invocation_id") REFERENCES "AgentInvocation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
