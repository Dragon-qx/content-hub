-- Migration: account_transfer_handover
-- Created at: 2026-07-19
-- Adds AccountTransfer + TransferStatus to track team-to-team account handovers.

CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "AccountTransfer" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fromTeamId" TEXT NOT NULL,
    "toTeamId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "note" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountTransfer_pkey" PRIMARY KEY ("id")
);

-- Look up the active/pending transfer for an account quickly.
CREATE INDEX "AccountTransfer_accountId_status_idx" ON "AccountTransfer"("accountId", "status");

-- List inbound proposals for a destination team.
CREATE INDEX "AccountTransfer_toTeamId_status_idx" ON "AccountTransfer"("toTeamId", "status");

ALTER TABLE "AccountTransfer" ADD CONSTRAINT "AccountTransfer_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
