-- Migration: wallet_billing
-- Created at: 2026-07-19
-- Per-team credit wallet and append-only ledger for usage billing.

CREATE TYPE "TransactionType" AS ENUM (
  'TOPUP', 'REFUND', 'PUBLISH', 'SCHEDULE', 'SYNC', 'MEDIA_PROCESS', 'AI_ASSIST'
);

CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "holdBalance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CREDIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Wallet_teamId_key" ON "Wallet"("teamId");

ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletTransaction_walletId_createdAt_idx"
    ON "WalletTransaction"("walletId", "createdAt");

ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
