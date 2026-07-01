import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class MetricsService {
  /**
   * Calculate BacktestMetrics from Trade table
   */
  static async calculateAndStoreMetrics(runId: string) {
    const run = await prisma.backtestRun.findUnique({
      where: { id: runId }
    });
    const trades = await prisma.trade.findMany({
      where: { backtestRunId: runId }
    });

    if (trades.length === 0) return null;

    const { metrics, monthlyPnL, signalSuccess } = MetricsService.computeMetricsFromTrades(trades, run ? run.capital : 100000);
    return MetricsService.persistMetrics(runId, metrics, monthlyPnL, signalSuccess);
  }

  /**
   * Pure function to compute metrics from a list of trades.
   * Extracted for unit testing signal bucketing and math.
   */
  static computeMetricsFromTrades(trades: any[], initialCapital: number) {

    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalRR = 0;
    
    // For Drawdown calculation
    let equity = initialCapital;
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
      } else if (pnl < 0) {
        losingTrades++;
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
    const lossRate = totalTrades > 0 ? (losingTrades / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
    const avgRR = totalTrades > 0 ? totalRR / totalTrades : 0;
    const avgWin  = winningTrades > 0 ? grossProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
    const expectancy = (winRate / 100 * avgWin) - (lossRate / 100 * avgLoss);
    
    const RISK_FREE_DAILY = 0.065 / 252;
    const closedTrades = trades.filter(t => t.status !== 'OPEN' && t.exitPrice !== null && t.exitPrice !== undefined);
    // NOTE: Approximation — using duration-adjusted trade returns normalized by holding period.
    // A proper calendar equity curve would map each trade's daily P&L to actual calendar dates;
    // that implementation is deferred as a known limitation.
    const dailyReturns = closedTrades.map(t => {
      const tradeReturn = ((t.exitPrice as number) - t.entryPrice) / t.entryPrice;
      return tradeReturn / (t.durationDays || 1); // normalize by holding duration
    });

    const avgReturn = dailyReturns.reduce(
      (a, b) => a + b, 0
    ) / (dailyReturns.length || 1);

    const variance = dailyReturns.reduce(
      (sum, r) => sum + Math.pow(r - avgReturn, 2), 0
    ) / (dailyReturns.length || 1);
    const stdDev = Math.sqrt(variance);

    // Annualize Sharpe: multiply by sqrt(252) (was missing)
    const sharpe = stdDev > 0 
      ? ((avgReturn - RISK_FREE_DAILY) / stdDev) * Math.sqrt(252)
      : 0;

    const downsideReturns = dailyReturns.filter(
      r => r < RISK_FREE_DAILY
    );
    const downsideVariance = downsideReturns.reduce(
      (sum, r) => sum + Math.pow(r - RISK_FREE_DAILY, 2), 0
    ) / (downsideReturns.length || 1);
    const downsideDev = Math.sqrt(downsideVariance);
    // Annualize Sortino: multiply by sqrt(252) (was missing)
    const sortino = downsideDev > 0 
      ? ((avgReturn - RISK_FREE_DAILY) / downsideDev) * Math.sqrt(252)
      : 0;

    const roundedSharpe = Math.round(sharpe * 100) / 100;
    const roundedSortino = Math.round(sortino * 100) / 100;

    const metricsData = {
      winRate,
      profitFactor,
      expectancy,
      maxDrawdown,
      sharpe: roundedSharpe,
      sortino: roundedSortino,
      avgRR
    };

    return { metrics: metricsData, monthlyPnL, signalSuccess };
  }

  static async persistMetrics(runId: string, metricsData: any, monthlyPnL: any, signalSuccess: any) {
    // Create Base Metrics
    const metrics = await prisma.backtestMetrics.create({
      data: {
        backtestRunId: runId,
        ...metricsData
      }
    });

    // Create Snapshots
    for (const [month, pnl] of Object.entries(monthlyPnL)) {
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: month as string,
          metricType: 'MONTH',
          metricKey: month as string,
          metricValue: pnl as number
        }
      });
    }

    for (const [signal, stats] of Object.entries(signalSuccess) as any) {
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: 'ALL',
          metricType: 'SIGNAL_WINRATE',
          metricKey: signal as string,
          metricValue: stats.total > 0 ? (stats.win / stats.total) * 100 : 0
        }
      });
    }

    return metrics;
  }
}
