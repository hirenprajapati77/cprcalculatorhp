-- Deduplicate historical rows before adding unique index.
-- Keep the newest row per (symbol, date, eventType) by createdAt/id.
DELETE FROM "MarketEvent" m
USING "MarketEvent" d
WHERE m."symbol" = d."symbol"
  AND m."date" = d."date"
  AND m."eventType" = d."eventType"
  AND (
    m."createdAt" < d."createdAt"
    OR (m."createdAt" = d."createdAt" AND m."id" < d."id")
  );

-- Create unique constraint backing index.
CREATE UNIQUE INDEX "MarketEvent_symbol_date_eventType_key"
  ON "MarketEvent"("symbol", "date", "eventType");
