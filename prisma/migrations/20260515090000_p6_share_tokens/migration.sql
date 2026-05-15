-- P6 — Embeddable chat widget share tokens.
-- One token per "deployment surface"; cleartext returned once at mint.
-- Daily caps tracked in ShareTokenUsageDay rolled at UTC midnight.

CREATE TABLE "AgentShareToken" (
  "id"                            TEXT NOT NULL,
  "agent_id"                      TEXT NOT NULL,
  "name"                          TEXT NOT NULL,
  "token_hash"                    TEXT NOT NULL,
  "token_prefix"                  TEXT NOT NULL,
  "network"                       TEXT NOT NULL,
  "allowed_origins"               TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "max_requests_per_day"          INTEGER,
  "max_spend_usd_micros_per_day"  BIGINT,
  "last_used_at"                  TIMESTAMP(3),
  "created_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at"                    TIMESTAMP(3),

  CONSTRAINT "AgentShareToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentShareToken_token_hash_key" ON "AgentShareToken"("token_hash");
CREATE INDEX "AgentShareToken_agent_id_idx"   ON "AgentShareToken"("agent_id");
CREATE INDEX "AgentShareToken_token_hash_idx" ON "AgentShareToken"("token_hash");

ALTER TABLE "AgentShareToken"
  ADD CONSTRAINT "AgentShareToken_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "KraterionAgent"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShareTokenUsageDay" (
  "share_token_id"    TEXT NOT NULL,
  "day_utc"           TEXT NOT NULL,
  "requests"          INTEGER NOT NULL DEFAULT 0,
  "spend_usd_micros"  BIGINT  NOT NULL DEFAULT 0,
  "updated_at"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShareTokenUsageDay_pkey" PRIMARY KEY ("share_token_id", "day_utc")
);

CREATE INDEX "ShareTokenUsageDay_share_token_id_idx"
  ON "ShareTokenUsageDay"("share_token_id");

ALTER TABLE "ShareTokenUsageDay"
  ADD CONSTRAINT "ShareTokenUsageDay_share_token_id_fkey"
  FOREIGN KEY ("share_token_id") REFERENCES "AgentShareToken"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AgentInvocation gains an optional share_token_id discriminator
-- alongside user_id / api_key_id / oauth_client_id.
ALTER TABLE "AgentInvocation"
  ADD COLUMN "share_token_id" TEXT;
