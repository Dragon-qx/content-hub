-- 20260719120000_template_variables
-- Add `variables` JSON column to ContentTemplate for template variable placeholders.

ALTER TABLE "ContentTemplate" ADD COLUMN "variables" JSON NOT NULL DEFAULT '[]';
