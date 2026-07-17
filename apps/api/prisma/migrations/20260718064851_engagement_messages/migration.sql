-- Engagement Hub: private message aggregation

-- CreateTable
CREATE TABLE "EngagementMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "conversationId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "sentByMe" BOOLEAN NOT NULL DEFAULT false,
    "messageDate" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "EngagementMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngagementMessage_accountId_externalId_key" ON "EngagementMessage"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "EngagementMessage_accountId_conversationId_idx" ON "EngagementMessage"("accountId", "conversationId");

-- CreateIndex
CREATE INDEX "EngagementMessage_accountId_messageDate_idx" ON "EngagementMessage"("accountId", "messageDate");

-- AddForeignKey
ALTER TABLE "EngagementMessage" ADD CONSTRAINT "EngagementMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
