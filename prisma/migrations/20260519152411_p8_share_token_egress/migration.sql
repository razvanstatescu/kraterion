-- B1 closeout — share-token egress meter source.
--
-- Adds two BigInt columns to `ShareTokenUsageDay`:
--
--   - `bytes_out`: total bytes egressed for that (token, day). Bumped
--     atomically alongside `requests` / `spend_usd_micros` inside
--     `ShareTokenUsageService.record(...)`.
--
--   - `bytes_out_at_last_emit`: cursor used by the share-token-egress
--     rollup processor. Each tick: read the delta against `bytes_out`,
--     emit a MeterEvent with the delta, snap the cursor forward.
--
-- Index on `day_utc` so the rollup worker can scan "today" cheaply
-- without doing a sequential scan of historical rows.

ALTER TABLE "ShareTokenUsageDay"
  ADD COLUMN "bytes_out" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "bytes_out_at_last_emit" BIGINT DEFAULT 0;

CREATE INDEX "ShareTokenUsageDay_day_utc_idx" ON "ShareTokenUsageDay"("day_utc");
