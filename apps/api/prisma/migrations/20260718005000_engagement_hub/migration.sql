-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateTable
CREATE TABLE "EngagementComment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "postExternalId" TEXT,
    "authorName" TEXT NOT NULL,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "sentiment" "Sentiment" NOT NULL DEFAULT 'NEUTRAL',
    "sentimentScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "replied" BOOLEAN NOT NULL DEFAULT false,
    "replyContent" TEXT,
    "repliedAt" TIMESTAMP(3),
    "commentDate" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "EngagementComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngagementComment_accountId_externalId_key" ON "EngagementComment"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "EngagementComment_accountId_sentiment_idx" ON "EngagementComment"("accountId", "sentiment");

-- CreateIndex
CREATE INDEX "EngagementComment_accountId_replied_idx" ON "EngagementComment"("accountId", "replied");

-- CreateIndex
CREATE INDEX "CommentTemplate_userId_idx" ON "CommentTemplate"("userId");

-- AddForeignKey
ALTER TABLE "EngagementComment" ADD CONSTRAINT "EngagementComment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
