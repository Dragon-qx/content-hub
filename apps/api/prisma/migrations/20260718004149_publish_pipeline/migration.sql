-- AlterTable
ALTER TABLE "PlatformPost" ADD COLUMN     "jobId" TEXT;
-- AlterTable
ALTER TABLE "PublishJob" ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "platform" "Platform" NOT NULL DEFAULT 'WECHAT_OFFICIAL';
-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
-- CreateIndex
CREATE UNIQUE INDEX "PlatformPost_jobId_key" ON "PlatformPost"("jobId");
-- CreateIndex
CREATE INDEX "PlatformPost_jobId_idx" ON "PlatformPost"("jobId");
-- CreateIndex
CREATE INDEX "PublishJob_status_scheduledAt_idx" ON "PublishJob"("status", "scheduledAt");
-- CreateIndex
CREATE INDEX "PublishJob_accountId_idx" ON "PublishJob"("accountId");
-- AddForeignKey
ALTER TABLE "PlatformPost" ADD CONSTRAINT "PlatformPost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "PublishJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
