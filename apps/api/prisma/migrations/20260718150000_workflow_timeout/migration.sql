-- Migration: workflow_timeout
-- Created at: 2026-07-18
-- Adds timeout handling fields to Workflow model for auto-approve/reject/escalate

ALTER TABLE "Workflow" ADD COLUMN "timeoutHours" INTEGER DEFAULT 48;

ALTER TABLE "Workflow" ADD COLUMN "timeoutAction" TEXT;

ALTER TABLE "Workflow" ADD COLUMN "escalateTo" TEXT;

ALTER TABLE "Workflow" ADD COLUMN "firstReminderAt" TIMESTAMP(3);

CREATE INDEX "Workflow_status_createdAt_idx" ON "Workflow"("status", "createdAt");
