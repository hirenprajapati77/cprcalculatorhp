import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class MetricsService {
  /**
   * Calculate BacktestMetrics from Trade table
   */
  static async calculateAndStoreMetrics(runId: string, version: number) {
    const trades = await prisma.trade.findMany({
      where: { backtestRunId: runId }
    });

    if (trades.length === 0) return null;

    let totalTrades = 0;
    let winningTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalRR = 0;
    
    // For Drawdown calculation
    let equity = 100000; // Starting proxy
    let peak = equity;
    let maxDrawdown = 0;

    const monthlyPnL: Record<string, number> = {};
    const signalSuccess: Record<string, { win: number; total: number }> = {};

    for (const trade of trades) {
      if (trade.status === 'OPEN') continue;

      totalTrades++;
      const pnl = trade.pnl || 0;
      
      equity += pnl;
      if (equity > peak) peak = equity;
      
      const drawdown = (peak - equity) / peak * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      if (pnl > 0) {
        winningTrades++;
        grossProfit += pnl;
      } else {
        grossLoss += Math.abs(pnl);
      }

      totalRR += trade.rr || 0;

      // Monthly mapping
      const monthKey = trade.exitDate ? new Date(trade.exitDate).toISOString().slice(0, 7) : 'UNKNOWN';
      monthlyPnL[monthKey] = (monthlyPnL[monthKey] || 0) + pnl;

      // Signal distribution
      if (!signalSuccess[trade.signal]) {
        signalSuccess[trade.signal] = { win: 0, total: 0 };
      }
      signalSuccess[trade.signal].total++;
      if (pnl > 0) signalSuccess[trade.signal].win++;
    }

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
    const avgRR = totalTrades > 0 ? totalRR / totalTrades : 0;
    const expectancy = (winRate / 100 * (grossProfit / winningTrades)) - ((1 - winRate / 100) * (grossLoss / (totalTrades - winningTrades || 1)));
    
    // Create Base Metrics
    const metrics = await prisma.backtestMetrics.create({
      data: {
        backtestRunId: runId,
        winRate,
        profitFactor,
        expectancy: isNaN(expectancy) ? 0 : expectancy,
        maxDrawdown,
        sharpe: 0, // Placeholder
        sortino: 0, // Placeholder
        avgRR
      }
    });

    // Create Snapshots
    for (const [month, pnl] of Object.entries(monthlyPnL)) {
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: month,
          metricType: 'MONTH',
          metricKey: month,
          metricValue: pnl
        }
      });
    }

    for (const [signal, stats] of Object.entries(signalSuccess)) {
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: 'ALL',
          metricType: 'SIGNAL_WINRATE',
          metricKey: signal,
          metricValue: stats.total > 0 ? (stats.win / stats.total) * 100 : 0
        }
      });
    }

    return metrics;
  }
}
