-- Migration: btst_alert_state_per_symbol
-- Change BtstAlertState from per-day unique to per-symbol-per-day unique.
-- This allows the scheduler to send follow-up Telegram alerts at 15:15/15:20
-- for NEW breakout symbols that were not qualifying at the time of the 15:10 send.

-- Drop the old per-day unique constraint
DROP INDEX IF EXISTS "BtstAlertState_date_key";

-- Add the symbol column (default existing rows to '_legacy' sentinel)
ALTER TABLE "BtstAlertState" ADD COLUMN "symbol" TEXT NOT NULL DEFAULT '_legacy';

-- Create new compound unique index
CREATE UNIQUE INDEX "BtstAlertState_date_symbol_key" ON "BtstAlertState"("date", "symbol");
