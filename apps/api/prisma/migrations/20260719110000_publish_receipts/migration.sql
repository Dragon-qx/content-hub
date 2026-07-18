-- Migration: publish_receipts
-- Created at: 2026-07-19
-- Per-post publish receipts (tamper-evident ledger + retained media asset).

CREATE TABLE "PublishReceipt" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "platformPostId" TEXT,
    "accountId" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'WECHAT_OFFICIAL',
    "externalId" TEXT,
    "externalUrl" TEXT,
    "assetId" TEXT,
    "receiptHash" TEXT NOT NULL,
    "metadata" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublishReceipt_pkey" PRIMARY KEY ("id")
);

-- one receipt per post
CREATE UNIQUE INDEX "PublishReceipt_platformPostId_key" ON "PublishReceipt"("platformPostId");
CREATE UNIQUE INDEX "PublishReceipt_assetId_key" ON "PublishReceipt"("assetId");
CREATE UNIQUE INDEX "PublishReceipt_receiptHash_key" ON "PublishReceipt"("receiptHash");

CREATE INDEX "PublishReceipt_contentId_idx" ON "PublishReceipt"("contentId");

ALTER TABLE "PublishReceipt" ADD CONSTRAINT "PublishReceipt_contentId_fkey"
    FOREIGN KEY ("contentId") REFERENCES "Content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublishReceipt" ADD CONSTRAINT "PublishReceipt_platformPostId_fkey"
    FOREIGN KEY ("platformPostId") REFERENCES "PlatformPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishReceipt" ADD CONSTRAINT "PublishReceipt_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublishReceipt" ADD CONSTRAINT "PublishReceipt_assetId_fkey"
    FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
