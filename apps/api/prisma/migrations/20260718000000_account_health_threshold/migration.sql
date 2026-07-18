-- Migration: account_health + health_threshold
-- Created at: 2026-07-18
-- Account health threshold alerting (PRD §3.2 健康度监测).

CREATE TYPE "HealthStatus" AS ENUM ('OK', 'WARNING', 'CRITICAL');

ALTER TABLE "SocialAccount" ADD COLUMN "authFailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialAccount" ADD COLUMN "apiRateLimitPct" DOUBLE PRECISION;

CREATE TABLE "AccountHealth" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tokenStatus" "HealthStatus" NOT NULL DEFAULT 'OK',
    "tokenExpiresAt" TIMESTAMP(3),
    "apiRateStatus" "HealthStatus" NOT NULL DEFAULT 'OK',
    "apiRateLimitPct" DOUBLE PRECISION,
    "syncStatus" "HealthStatus" NOT NULL DEFAULT 'OK',
    "lastSyncedAt" TIMESTAMP(3),
    "authStatus" "HealthStatus" NOT NULL DEFAULT 'OK',
    "authFailCount" INTEGER NOT NULL DEFAULT 0,
    "publishStatus" "HealthStatus" NOT NULL DEFAULT 'OK',
    "publishFailCount" INTEGER NOT NULL DEFAULT 0,
    "overallStatus" "HealthStatus" NOT NULL DEFAULT 'OK',
    "lastAlertAt" TIMESTAMP(3),
    "lastAlertSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountHealth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountHealth_accountId_key" ON "AccountHealth"("accountId");
CREATE INDEX "AccountHealth_teamId_idx" ON "AccountHealth"("teamId");
CREATE INDEX "AccountHealth_overallStatus_idx" ON "AccountHealth"("overallStatus");
CREATE INDEX "AccountHealth_teamId_overallStatus_idx" ON "AccountHealth"("teamId", "overallStatus");

ALTER TABLE "AccountHealth" ADD CONSTRAINT "AccountHealth_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HealthThreshold" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tokenExpireDays" INTEGER NOT NULL DEFAULT 7,
    "apiRateLimitPct" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "syncStaleDays" INTEGER NOT NULL DEFAULT 7,
    "authFailThreshold" INTEGER NOT NULL DEFAULT 3,
    "publishFailThreshold" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthThreshold_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HealthThreshold_teamId_key" ON "HealthThreshold"("teamId");

ALTER TABLE "HealthThreshold" ADD CONSTRAINT "HealthThreshold_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
