SELECT 
  "tradeDate" as stored_utc,
  "signalType",
  "symbol",
  "optionContract",
  "entryCmp",
  "cmp916",
  "cmp930",
  "cmp945",
  "cmp1000",
  "exitCmp",
  "pnl"
FROM "TradeJournal"
WHERE "tradeDate" >= '2026-07-01 18:00:00'
ORDER BY "tradeDate" DESC, "signalType";
