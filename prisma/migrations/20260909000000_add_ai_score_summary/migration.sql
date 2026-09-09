-- Gemini deep-read pass: per-job semantic fit score + summary.
-- Nullable so existing rows and jobs not sent to Gemini stay unaffected.
ALTER TABLE "Job" ADD COLUMN "aiScore" INTEGER;
ALTER TABLE "Job" ADD COLUMN "aiSummary" TEXT;
