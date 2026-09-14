-- Drop redundant single-column index on ScannerResult(symbol)
-- Covered by composite unique index ScannerResult_symbol_date_key on ScannerResult(symbol, date)
DROP INDEX IF EXISTS "ScannerResult_symbol_idx";

