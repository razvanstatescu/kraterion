-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "zklogin_sub" TEXT NOT NULL,
    "sui_address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "default_region" TEXT NOT NULL DEFAULT 'eu-central-1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "access_key_id" TEXT NOT NULL,
    "secret_wrapped" BYTEA NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bucket" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'eu-central-1',
    "encryption_mode" TEXT NOT NULL DEFAULT 'private',
    "kraterion_bucket_object_id" TEXT NOT NULL,
    "api_access_granted" BOOLEAN NOT NULL DEFAULT true,
    "funding_pool_wal_balance" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "S3Object" (
    "id" TEXT NOT NULL,
    "bucket_id" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "content_type" TEXT,
    "etag" TEXT NOT NULL,
    "walrus_blob_id" TEXT NOT NULL,
    "shared_blob_object_id" TEXT NOT NULL,
    "storage_end_epoch" INTEGER NOT NULL,
    "seal_identity" BYTEA NOT NULL,
    "encryption_envelope" BYTEA NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "S3Object_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" BIGSERIAL NOT NULL,
    "project_id" TEXT NOT NULL,
    "bucket_id" TEXT,
    "kind" TEXT NOT NULL,
    "bytes_in" INTEGER NOT NULL DEFAULT 0,
    "bytes_out" INTEGER NOT NULL DEFAULT 0,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubWallet" (
    "id" TEXT NOT NULL,
    "sui_address" TEXT NOT NULL,
    "mnemonic_wrapped" BYTEA NOT NULL,
    "role" TEXT NOT NULL,
    "account_id" TEXT,
    "sui_balance" BIGINT NOT NULL DEFAULT 0,
    "wal_balance" BIGINT NOT NULL DEFAULT 0,
    "last_topup_at" TIMESTAMP(3),

    CONSTRAINT "SubWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_zklogin_sub_key" ON "Account"("zklogin_sub");

-- CreateIndex
CREATE UNIQUE INDEX "Account_sui_address_key" ON "Account"("sui_address");

-- CreateIndex
CREATE INDEX "Account_sui_address_idx" ON "Account"("sui_address");

-- CreateIndex
CREATE INDEX "Project_account_id_idx" ON "Project"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_access_key_id_key" ON "ApiKey"("access_key_id");

-- CreateIndex
CREATE INDEX "ApiKey_project_id_idx" ON "ApiKey"("project_id");

-- CreateIndex
CREATE INDEX "ApiKey_access_key_id_idx" ON "ApiKey"("access_key_id");

-- CreateIndex
CREATE UNIQUE INDEX "Bucket_kraterion_bucket_object_id_key" ON "Bucket"("kraterion_bucket_object_id");

-- CreateIndex
CREATE INDEX "Bucket_project_id_idx" ON "Bucket"("project_id");

-- CreateIndex
CREATE INDEX "Bucket_kraterion_bucket_object_id_idx" ON "Bucket"("kraterion_bucket_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "Bucket_project_id_name_key" ON "Bucket"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "S3Object_shared_blob_object_id_key" ON "S3Object"("shared_blob_object_id");

-- CreateIndex
CREATE INDEX "S3Object_bucket_id_s3_key_idx" ON "S3Object"("bucket_id", "s3_key");

-- CreateIndex
CREATE INDEX "S3Object_storage_end_epoch_idx" ON "S3Object"("storage_end_epoch");

-- CreateIndex
CREATE INDEX "S3Object_shared_blob_object_id_idx" ON "S3Object"("shared_blob_object_id");

-- CreateIndex
CREATE UNIQUE INDEX "S3Object_bucket_id_s3_key_key" ON "S3Object"("bucket_id", "s3_key");

-- CreateIndex
CREATE INDEX "UsageEvent_project_id_occurred_at_idx" ON "UsageEvent"("project_id", "occurred_at");

-- CreateIndex
CREATE INDEX "UsageEvent_bucket_id_occurred_at_idx" ON "UsageEvent"("bucket_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "SubWallet_sui_address_key" ON "SubWallet"("sui_address");

-- CreateIndex
CREATE UNIQUE INDEX "SubWallet_account_id_key" ON "SubWallet"("account_id");

-- CreateIndex
CREATE INDEX "SubWallet_role_idx" ON "SubWallet"("role");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bucket" ADD CONSTRAINT "Bucket_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "S3Object" ADD CONSTRAINT "S3Object_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "Bucket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubWallet" ADD CONSTRAINT "SubWallet_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
