-- NOTE: Prisma's `migrate diff` regularly re-emits drops of the
-- pgvector HNSW and tsvector GIN indexes on `KnowledgeChunk`, plus an
-- `ALTER COLUMN content_tsv DROP DEFAULT`, because Prisma can't model
-- those raw-SQL constructs. Those statements have been stripped here
-- (same workaround documented in the storage-pool migration). The
-- indexes were created in 20260512134312_knowledge_chunk_hnsw and
-- 20260512130932_knowledge_chunk_tsvector and must stay intact.

-- AlterTable
ALTER TABLE "AgentInvocation" ADD COLUMN     "cost_price_version" TEXT,
ADD COLUMN     "cost_usd_micros" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "key_source" TEXT;

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "stripe_mode" TEXT NOT NULL DEFAULT 'test',
    "stripe_customer_id_test" TEXT,
    "stripe_customer_id_live" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "has_payment_method" BOOLEAN NOT NULL DEFAULT false,
    "default_payment_method" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "billing_email" TEXT,
    "tax_id" TEXT,
    "country" TEXT,
    "hard_spend_cap_usd_cents" INTEGER,
    "soft_alert_thresholds" INTEGER[] DEFAULT ARRAY[50, 80, 100]::INTEGER[],
    "upload_rate_limit_gb_per_day" INTEGER NOT NULL DEFAULT 1024,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterEvent" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "meter_name" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "identifier" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),
    "stripe_status" TEXT NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "payload" JSONB,

    CONSTRAINT "MeterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDaily" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "meter_name" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "cost_usd_micros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BYOKDailySpend" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_usd_micros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "BYOKDailySpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingStorageDowngrade" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "new_reserved_gb" INTEGER NOT NULL,
    "current_reserved_gb" INTEGER NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripe_schedule_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "applied_at" TIMESTAMP(3),
    "resize_shrink_tx_digest" TEXT,
    "last_error" TEXT,

    CONSTRAINT "PendingStorageDowngrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL,
    "last_error" TEXT,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostFloorSnapshot" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "wal_usd_micros" BIGINT NOT NULL,
    "sui_usd_micros" BIGINT NOT NULL,
    "walrus_storage_price_frost" BIGINT NOT NULL,
    "walrus_write_price_frost" BIGINT NOT NULL,
    "per_meter_floor_json" JSONB NOT NULL,
    "oracle_sources" JSONB NOT NULL,
    "alert_fired" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostFloorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_project_id_key" ON "BillingAccount"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_stripe_customer_id_test_key" ON "BillingAccount"("stripe_customer_id_test");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_stripe_customer_id_live_key" ON "BillingAccount"("stripe_customer_id_live");

-- CreateIndex
CREATE INDEX "BillingAccount_stripe_customer_id_test_idx" ON "BillingAccount"("stripe_customer_id_test");

-- CreateIndex
CREATE INDEX "BillingAccount_stripe_customer_id_live_idx" ON "BillingAccount"("stripe_customer_id_live");

-- CreateIndex
CREATE UNIQUE INDEX "MeterEvent_identifier_key" ON "MeterEvent"("identifier");

-- CreateIndex
CREATE INDEX "MeterEvent_stripe_status_occurred_at_idx" ON "MeterEvent"("stripe_status", "occurred_at");

-- CreateIndex
CREATE INDEX "MeterEvent_project_id_meter_name_period_start_idx" ON "MeterEvent"("project_id", "meter_name", "period_start");

-- CreateIndex
CREATE INDEX "UsageDaily_project_id_day_idx" ON "UsageDaily"("project_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "UsageDaily_project_id_day_meter_name_key" ON "UsageDaily"("project_id", "day", "meter_name");

-- CreateIndex
CREATE UNIQUE INDEX "BYOKDailySpend_project_id_day_model_key" ON "BYOKDailySpend"("project_id", "day", "model");

-- CreateIndex
CREATE UNIQUE INDEX "PendingStorageDowngrade_project_id_key" ON "PendingStorageDowngrade"("project_id");

-- CreateIndex
CREATE INDEX "PendingStorageDowngrade_status_effective_at_idx" ON "PendingStorageDowngrade"("status", "effective_at");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_type_received_at_idx" ON "StripeWebhookEvent"("type", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "CostFloorSnapshot_day_key" ON "CostFloorSnapshot"("day");

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
