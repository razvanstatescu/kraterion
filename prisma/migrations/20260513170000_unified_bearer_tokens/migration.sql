-- Unified bearer API tokens (kr_live_/kr_test_) alongside existing S3 AKIA keys.
-- Existing rows are S3 SigV4 keys; new column `kind` defaults to "s3" so they
-- keep working without backfill. Bearer columns are nullable for the same
-- reason — only kind="bearer" rows populate token_hash/token_prefix/network.

ALTER TABLE "ApiKey"
  ADD COLUMN "kind"         TEXT      NOT NULL DEFAULT 's3',
  ADD COLUMN "token_hash"   TEXT,
  ADD COLUMN "token_prefix" TEXT,
  ADD COLUMN "network"      TEXT,
  ADD COLUMN "scopes"       TEXT[]    NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Make S3-only columns nullable so bearer rows can omit them.
ALTER TABLE "ApiKey" ALTER COLUMN "access_key_id"  DROP NOT NULL;
ALTER TABLE "ApiKey" ALTER COLUMN "secret_wrapped" DROP NOT NULL;

CREATE UNIQUE INDEX "ApiKey_token_hash_key" ON "ApiKey"("token_hash");
CREATE INDEX        "ApiKey_token_hash_idx" ON "ApiKey"("token_hash");
