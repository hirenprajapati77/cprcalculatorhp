import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT 
      SPLIT_PART(signal, ' w=', 1) as base_signal,
      COUNT(*) as total_trades,
      SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winners,
      ROUND(AVG(CASE WHEN pnl > 0 THEN 1.0 ELSE 0 END) * 100, 1) as win_rate_pct,
      ROUND(AVG(pnl)::numeric, 2) as avg_pnl,
      ROUND(SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END)::numeric, 2) as gross_profit,
      ROUND(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END)::numeric, 2) as gross_loss
    FROM "Trade" t
    JOIN "BacktestRun" r ON t."backtestRunId" = r.id
    WHERE r."universe" = 'NIFTY50'
      AND r."startDate" >= '2024-01-01'
    GROUP BY base_signal
    ORDER BY total_trades DESC;
  `);
  console.table(result);
}
main().finally(() => prisma.$disconnect());
