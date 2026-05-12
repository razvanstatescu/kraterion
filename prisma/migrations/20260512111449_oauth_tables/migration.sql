-- K3b: OAuth 2.1 + DCR tables for the MCP server.
--
-- Prisma's auto-generated migration also wanted to drop the K1/K2
-- HNSW + tsvector indexes (it can't see Prisma-`Unsupported(...)`
-- columns + raw indexes, so they look like "drift" to the schema
-- engine). We hand-trim those entries — the indexes must stay.

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "client_name" TEXT,
    "redirect_uris" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthGrant" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scopes" TEXT[],
    "code" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthClient_client_id_key" ON "OAuthClient"("client_id");

-- CreateIndex
CREATE INDEX "OAuthClient_last_used_at_idx" ON "OAuthClient"("last_used_at");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthGrant_code_key" ON "OAuthGrant"("code");

-- CreateIndex
CREATE INDEX "OAuthGrant_client_id_idx" ON "OAuthGrant"("client_id");

-- CreateIndex
CREATE INDEX "OAuthGrant_account_id_idx" ON "OAuthGrant"("account_id");
