-- Analytics anomaly detection: alert signature log

-- CreateTable
CREATE TABLE "AnomalyAlert" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnomalyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnomalyAlert_accountId_createdAt_idx" ON "AnomalyAlert"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "AnomalyAlert_teamId_createdAt_idx" ON "AnomalyAlert"("teamId", "createdAt");

-- AddForeignKey
ALTER TABLE "AnomalyAlert" ADD CONSTRAINT "AnomalyAlert_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
