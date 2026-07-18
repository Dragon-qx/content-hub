-- Migration: account_groups
-- Created at: 2026-07-18

CREATE TABLE "AccountGroup" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountGroup_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountGroup_teamId_idx" ON "AccountGroup"("teamId");

ALTER TABLE "AccountGroup" ADD CONSTRAINT "AccountGroup_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SocialAccount" ADD COLUMN "groupId" TEXT;

ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "AccountGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
