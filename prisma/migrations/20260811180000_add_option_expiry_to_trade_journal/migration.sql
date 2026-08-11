-- Add optionExpiry column to TradeJournal table.
-- Stores the parsed expiry string (e.g. 'JUL 2026' or '30 JUL 2026') at signal
-- write time so morning snapshot crons never need to regex-parse it from the
-- optionContract display string — eliminating the Invalid Date fallback bug.
-- Nullable so existing rows remain valid without a backfill.
ALTER TABLE "TradeJournal" ADD COLUMN "optionExpiry" TEXT;
