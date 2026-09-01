-- Invite gate: admin-generated codes (KRT-XXXXXX) with a claim budget, and a
-- claim ledger. See prisma/schema.prisma "Invite gate" section and
-- apps/control-plane/src/invites for the atomic-claim logic.

-- CreateTable
CREATE TABLE "InviteCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "max_claims" INTEGER NOT NULL DEFAULT 1,
    "claim_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InviteClaim" (
    "id" TEXT NOT NULL,
    "invite_code_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InviteClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InviteCode_code_key" ON "InviteCode"("code");

-- CreateIndex
CREATE INDEX "InviteCode_code_idx" ON "InviteCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InviteClaim_account_id_key" ON "InviteClaim"("account_id");

-- CreateIndex
CREATE INDEX "InviteClaim_invite_code_id_idx" ON "InviteClaim"("invite_code_id");

-- CreateIndex
CREATE UNIQUE INDEX "InviteClaim_invite_code_id_account_id_key" ON "InviteClaim"("invite_code_id", "account_id");

-- AddForeignKey
ALTER TABLE "InviteClaim" ADD CONSTRAINT "InviteClaim_invite_code_id_fkey" FOREIGN KEY ("invite_code_id") REFERENCES "InviteCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InviteClaim" ADD CONSTRAINT "InviteClaim_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
