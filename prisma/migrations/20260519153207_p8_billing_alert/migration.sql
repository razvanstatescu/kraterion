-- B4 closeout — soft-cap threshold alerts.
--
-- Each row records a single threshold crossing per (project, period,
-- threshold_pct, channel). The evaluator fires writes; the delivery
-- worker drains them to whichever provider lands in B6+.
--
-- `(project_id, period, threshold_pct, channel)` is unique so a
-- replay of the evaluator can't double-fire. Period rollover yields
-- a fresh row naturally because `period` (YYYY-MM) advances.

CREATE TABLE "BillingAlert" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "threshold_pct" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "accrued_at_fire_usd_cents" INTEGER NOT NULL,
    "cap_usd_cents" INTEGER NOT NULL,
    "fired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "payload" JSONB,

    CONSTRAINT "BillingAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BillingAlert_delivered_at_fired_at_idx" ON "BillingAlert"("delivered_at", "fired_at");

CREATE INDEX "BillingAlert_project_id_period_idx" ON "BillingAlert"("project_id", "period");

CREATE UNIQUE INDEX "BillingAlert_project_id_period_threshold_pct_channel_key" ON "BillingAlert"("project_id", "period", "threshold_pct", "channel");
