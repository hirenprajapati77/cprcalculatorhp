-- M-3: Drop redundant single-column indexes whose leading column is already
-- covered by an existing composite index (PostgreSQL uses the composite's
-- leading column for these queries). Frees write overhead and storage.
--
-- ScannerResult(date)      -> covered by ScannerResult(date, score)
-- Trade(backtestRunId)     -> covered by Trade(backtestRunId, status) / (backtestRunId, pnl)
-- BtstSignal(signalDate)   -> covered by BtstSignal(signalDate, direction)
--   (BtstSignal is the mapped table name of the OvernightSignal model)
--
-- IF EXISTS keeps this migration idempotent and safe on databases where an
-- index was already removed manually.

DROP INDEX IF EXISTS "ScannerResult_date_idx";

DROP INDEX IF EXISTS "Trade_backtestRunId_idx";

DROP INDEX IF EXISTS "BtstSignal_signalDate_idx";
