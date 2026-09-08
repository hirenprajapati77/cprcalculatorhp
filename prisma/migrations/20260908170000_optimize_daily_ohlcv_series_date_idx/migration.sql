-- Drop prior index with suboptimal leading range column
DROP INDEX IF EXISTS "DailyOhlcv_date_series_idx";

-- Create optimized composite index with equality column (series) leading for WHERE series = 'EQ' AND date >= X
CREATE INDEX IF NOT EXISTS "DailyOhlcv_series_date_idx" ON "DailyOhlcv" ("series", "date");
