SELECT 
  COUNT(*) as total_trades,
  COUNT("scoreV2") as with_v2_score,
  MIN("tradeDate") as oldest_trade,
  MAX("tradeDate") as latest_trade,
  COUNT(CASE WHEN "pnl" IS NOT NULL THEN 1 END) as resolved_trades
FROM "TradeJournal";
