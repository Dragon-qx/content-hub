-- Engagement Hub: sentiment keyword alerts + comment alert-dedupe flag

-- AddColumn
ALTER TABLE "EngagementComment" ADD COLUMN "alerted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SentimentKeyword" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentimentKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentimentKeyword_teamId_keyword_key" ON "SentimentKeyword"("teamId", "keyword");

-- CreateIndex
CREATE INDEX "SentimentKeyword_teamId_idx" ON "SentimentKeyword"("teamId");

-- AddForeignKey
ALTER TABLE "SentimentKeyword" ADD CONSTRAINT "SentimentKeyword_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
