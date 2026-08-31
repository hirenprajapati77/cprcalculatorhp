-- Add composite index [date, symbol] to DailyOhlcv for cross-sectional queries
CREATE INDEX IF NOT EXISTS "DailyOhlcv_date_symbol_idx" ON "DailyOhlcv" ("date", "symbol");
