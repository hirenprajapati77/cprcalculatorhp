-- H-01: Add composite indexes to DailyOhlcv for market-tools query performance
-- [symbol, date] covers ORDER BY symbol ASC, date ASC in candle range fetches
-- [date, series] covers WHERE series = 'EQ' ORDER BY date DESC LIMIT N queries

CREATE INDEX IF NOT EXISTS "DailyOhlcv_symbol_date_idx" ON "DailyOhlcv" (symbol, date);
CREATE INDEX IF NOT EXISTS "DailyOhlcv_date_series_idx" ON "DailyOhlcv" (date, series);
