import { prisma } from '@/lib/db';
import { RankingService } from '../ranking.service';
import {
  computeIndexBtstSliceMetrics,
  indexSliceStatsToSnapshots,
} from './index-btst-slice-metrics';
import {
  computeStockBtstSliceMetrics,
  stockSliceStatsToSnapshots,
} from './stock-btst-slice-metrics';

export class MetricsService {
  /**
   * Calculate BacktestMetrics from Trade table
   */
  static async calculateAndStoreMetrics(runId: string) {
    const run = await prisma.backtestRun.findUnique({
      where: { id: runId }
    });
    const trades = await prisma.trade.findMany({
      where: { backtestRunId: runId },
      orderBy: [{ exitDate: 'asc' }, { entryDate: 'asc' }],
    });

    if (trades.length === 0) return null;

    const { metrics, monthlyPnL, signalSuccess, signalAnalysis, scoreBandAnalysis, fillRateData, indexSliceMetrics, stockSliceMetrics } = MetricsService.computeMetricsFromTrades(trades, run ? run.capital : 100000);
    return MetricsService.persistMetrics(runId, metrics, monthlyPnL, signalSuccess, signalAnalysis, scoreBandAnalysis, fillRateData, indexSliceMetrics, stockSliceMetrics);
  }

  /**
   * Pure function to compute metrics from a list of trades.
   * Extracted for unit testing signal bucketing and math.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const signalSuccess: Record<string, { win: number; loss: number; total: number }> = {};

    // Signal tag & score band stats aggregators
    const signalStats: Record<string, { win: number; total: number; totalRR: number; grossProfit: number; grossLoss: number; winningTrades: number; losingTrades: number }> = {};
    const scoreBandStats: Record<string, { win: number; total: number; totalRR: number; grossProfit: number; grossLoss: number; winningTrades: number; losingTrades: number }> = {};

    // Fill rate stats
    let totalSetups = 0;
    let triggeredSetups = 0;
    let neverTriggeredSetups = 0;

    for (const trade of trades) {
      if (trade.strategyMode === 'SCANNER_DRIVEN') {
        totalSetups++;
        if (trade.status === 'NEVER_TRIGGERED') {
          neverTriggeredSetups++;
        } else {
          triggeredSetups++;
        }
      }

      if (trade.status === 'OPEN' || trade.status === 'NEVER_TRIGGERED') continue;

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
        signalSuccess[trade.signal] = { win: 0, loss: 0, total: 0 };
      }
      signalSuccess[trade.signal].total++;
      if (pnl > 0) signalSuccess[trade.signal].win++;
      else if (pnl < 0) signalSuccess[trade.signal].loss++;

      // Tag-specific validation
      const tags: string[] = [];
      if (trade.signalsJson) {
        try {
          tags.push(...JSON.parse(trade.signalsJson));
        } catch {
          tags.push(trade.signal);
        }
      } else {
        tags.push(trade.signal);
      }

      for (const tag of tags) {
        if (!signalStats[tag]) {
          signalStats[tag] = { win: 0, total: 0, totalRR: 0, grossProfit: 0, grossLoss: 0, winningTrades: 0, losingTrades: 0 };
        }
        const s = signalStats[tag];
        s.total++;
        s.totalRR += trade.rr || 0;
        if (pnl > 0) {
          s.win++;
          s.winningTrades++;
          s.grossProfit += pnl;
        } else if (pnl < 0) {
          s.losingTrades++;
          s.grossLoss += Math.abs(pnl);
        }
      }

      // Score-band validation
      const scoreBand = trade.score !== null && trade.score !== undefined
        ? RankingService.getClassification(trade.score)
        : 'Unknown';

      if (!scoreBandStats[scoreBand]) {
        scoreBandStats[scoreBand] = { win: 0, total: 0, totalRR: 0, grossProfit: 0, grossLoss: 0, winningTrades: 0, losingTrades: 0 };
      }
      const sb = scoreBandStats[scoreBand];
      sb.total++;
      sb.totalRR += trade.rr || 0;
      if (pnl > 0) {
        sb.win++;
        sb.winningTrades++;
        sb.grossProfit += pnl;
      } else if (pnl < 0) {
        sb.losingTrades++;
        sb.grossLoss += Math.abs(pnl);
      }
    }

    const decisiveTrades = winningTrades + losingTrades;
    const winRate = decisiveTrades > 0 ? (winningTrades / decisiveTrades) * 100 : 0;
    const lossRate = decisiveTrades > 0 ? (losingTrades / decisiveTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 999 : 0);
    const avgRR = totalTrades > 0 ? totalRR / totalTrades : 0;
    const avgWin  = winningTrades > 0 ? grossProfit / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? grossLoss / losingTrades : 0;
    // Expectancy calculation relies on winRate and lossRate which are now computed over decisive trades.
    // Thus, it represents the expected value per *decisive* trade (scratches contribute $0).
    const expectancy = (winRate / 100 * avgWin) - (lossRate / 100 * avgLoss);
    
    const RISK_FREE_DAILY = 0.065 / 252;
    const closedTrades = trades.filter(t => t.status !== 'OPEN' && t.status !== 'NEVER_TRIGGERED' && t.exitPrice !== null && t.exitPrice !== undefined);
    const dailyReturns = closedTrades.map(t => {
      const isShort = ['SHORT', 'STBT', 'SELL', 'SHORT_SELL', 'PE'].includes((t.type ?? '').toUpperCase());
      const tradeReturn = isShort
        ? (t.entryPrice - (t.exitPrice as number)) / t.entryPrice
        : ((t.exitPrice as number) - t.entryPrice) / t.entryPrice;
      return tradeReturn / (t.durationDays || 1); // normalize by holding duration
    });

    const avgReturn = dailyReturns.reduce(
      (a, b) => a + b, 0
    ) / (dailyReturns.length || 1);

    const variance = dailyReturns.reduce(
      (sum, r) => sum + Math.pow(r - avgReturn, 2), 0
    ) / (dailyReturns.length || 1);

    const stdDev = Math.sqrt(variance);
    const sharpe = stdDev > 0
      ? ((avgReturn - RISK_FREE_DAILY) / stdDev) * Math.sqrt(252)
      : 0;

    // Sortino calculation (downside deviation only)
    const downsideReturns = dailyReturns.map(r => Math.min(0, r - RISK_FREE_DAILY));
    const downsideVariance = downsideReturns.reduce(
      (sum, r) => sum + Math.pow(r, 2), 0
    ) / (downsideReturns.length || 1);
    const downsideDev = Math.sqrt(downsideVariance);
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

    const MIN_SAMPLE = 15;

    // Calculate final stats for tags and score bands
    const signalAnalysis: Record<string, { winRate: number; avgRR: number; expectancy: number; total: number; reliable: boolean }> = {};
    for (const [tag, s] of Object.entries(signalStats)) {
      const decisive = s.winningTrades + s.losingTrades;
      const wr = decisive > 0 ? (s.winningTrades / decisive) * 100 : 0;
      const lr = decisive > 0 ? (s.losingTrades / decisive) * 100 : 0;
      const ar = s.total > 0 ? s.totalRR / s.total : 0;
      const aw = s.winningTrades > 0 ? s.grossProfit / s.winningTrades : 0;
      const al = s.losingTrades > 0 ? s.grossLoss / s.losingTrades : 0;
      const exp = (wr / 100 * aw) - (lr / 100 * al);
      signalAnalysis[tag] = { winRate: wr, avgRR: ar, expectancy: exp, total: s.total, reliable: s.total >= MIN_SAMPLE };
    }

    const scoreBandAnalysis: Record<string, { winRate: number; avgRR: number; expectancy: number; total: number; reliable: boolean }> = {};
    for (const [sbName, sb] of Object.entries(scoreBandStats)) {
      const decisive = sb.winningTrades + sb.losingTrades;
      const wr = decisive > 0 ? (sb.winningTrades / decisive) * 100 : 0;
      const lr = decisive > 0 ? (sb.losingTrades / decisive) * 100 : 0;
      const ar = sb.total > 0 ? sb.totalRR / sb.total : 0;
      const aw = sb.winningTrades > 0 ? sb.grossProfit / sb.winningTrades : 0;
      const al = sb.losingTrades > 0 ? sb.grossLoss / sb.losingTrades : 0;
      const exp = (wr / 100 * aw) - (lr / 100 * al);
      scoreBandAnalysis[sbName] = { winRate: wr, avgRR: ar, expectancy: exp, total: sb.total, reliable: sb.total >= MIN_SAMPLE };
    }

    const fillRateData = { totalSetups, triggeredSetups, neverTriggeredSetups };

    const indexTrades = trades.filter((t) => t.strategyMode === 'INDEX_BTST_DRIVEN');
    const indexSliceMetrics =
      indexTrades.length > 0 ? computeIndexBtstSliceMetrics(indexTrades) : null;

    const stockTrades = trades.filter((t) => t.strategyMode === 'BTST_STBT_DRIVEN');
    const stockSliceMetrics =
      stockTrades.length > 0 ? computeStockBtstSliceMetrics(stockTrades) : null;

    return { 
      metrics: metricsData, 
      monthlyPnL, 
      signalSuccess, 
      signalAnalysis, 
      scoreBandAnalysis, 
      fillRateData,
      indexSliceMetrics,
      stockSliceMetrics,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async persistMetrics(runId: string, metricsData: any, monthlyPnL: any, signalSuccess: any, signalAnalysis?: any, scoreBandAnalysis?: any, fillRateData?: any, indexSliceMetrics?: ReturnType<typeof computeIndexBtstSliceMetrics> | null, stockSliceMetrics?: ReturnType<typeof computeStockBtstSliceMetrics> | null) {
    // Create Base Metrics
    const metrics = await prisma.backtestMetrics.create({
      data: {
        backtestRunId: runId,
        ...metricsData
      }
    });

    // Create Snapshots for Months
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

    // Create Snapshots for Signals (Legacy)
    for (const [signal, stats] of Object.entries(signalSuccess) as [string, { win: number; loss: number; total: number }][]) {
      const decisive = stats.win + stats.loss;
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: 'ALL',
          metricType: 'SIGNAL_WINRATE',
          metricKey: signal as string,
          metricValue: decisive > 0 ? (stats.win / decisive) * 100 : 0
        }
      });
    }

    // Create Snapshots for SCANNER_DRIVEN advanced tag validation
    if (signalAnalysis) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [tag, stats] of Object.entries(signalAnalysis) as any) {
        // Win rate
        await prisma.backtestMetricSnapshot.create({
          data: {
            backtestRunId: runId,
            period: 'ALL',
            metricType: 'SCANNER_SIGNAL_WINRATE',
            metricKey: tag,
            metricValue: stats.winRate
          }
        });
        // Avg RR
        await prisma.backtestMetricSnapshot.create({
          data: {
            backtestRunId: runId,
            period: 'ALL',
            metricType: 'SCANNER_SIGNAL_AVGRR',
            metricKey: tag,
            metricValue: stats.avgRR
          }
        });
        // Expectancy
        await prisma.backtestMetricSnapshot.create({
          data: {
            backtestRunId: runId,
            period: 'ALL',
            metricType: 'SCANNER_SIGNAL_EXPECTANCY',
            metricKey: tag,
            metricValue: stats.expectancy
          }
        });
      }
    }

    // Create Snapshots for SCANNER_DRIVEN advanced score band validation
    if (scoreBandAnalysis) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const [sbName, stats] of Object.entries(scoreBandAnalysis) as any) {
        // Win rate
        await prisma.backtestMetricSnapshot.create({
          data: {
            backtestRunId: runId,
            period: 'ALL',
            metricType: 'SCORE_BAND_WINRATE',
            metricKey: sbName,
            metricValue: stats.winRate
          }
        });
        // Avg RR
        await prisma.backtestMetricSnapshot.create({
          data: {
            backtestRunId: runId,
            period: 'ALL',
            metricType: 'SCORE_BAND_AVGRR',
            metricKey: sbName,
            metricValue: stats.avgRR
          }
        });
        // Expectancy
        await prisma.backtestMetricSnapshot.create({
          data: {
            backtestRunId: runId,
            period: 'ALL',
            metricType: 'SCORE_BAND_EXPECTANCY',
            metricKey: sbName,
            metricValue: stats.expectancy
          }
        });
      }
    }

    // Create Snapshots for Fill Rate (Setup count, Trigger count, Never Triggered count)
    if (fillRateData) {
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: 'ALL',
          metricType: 'FILL_RATE_TOTAL_SETUPS',
          metricKey: 'TOTAL_SETUPS',
          metricValue: fillRateData.totalSetups
        }
      });
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: 'ALL',
          metricType: 'FILL_RATE_TRIGGERED',
          metricKey: 'TRIGGERED_SETUPS',
          metricValue: fillRateData.triggeredSetups
        }
      });
      await prisma.backtestMetricSnapshot.create({
        data: {
          backtestRunId: runId,
          period: 'ALL',
          metricType: 'FILL_RATE_NEVER_TRIGGERED',
          metricKey: 'NEVER_TRIGGERED_SETUPS',
          metricValue: fillRateData.neverTriggeredSetups
        }
      });
    }

    if (indexSliceMetrics) {
      const vixRows = indexSliceStatsToSnapshots(runId, 'INDEX_VIX', indexSliceMetrics.byVixBand);
      const regimeRows = indexSliceStatsToSnapshots(
        runId,
        'INDEX_REGIME',
        indexSliceMetrics.byRegime
      );
      for (const row of [...vixRows, ...regimeRows]) {
        await prisma.backtestMetricSnapshot.create({ data: row });
      }
    }

    if (stockSliceMetrics) {
      const stockRows = [
        ...stockSliceStatsToSnapshots(runId, 'STOCK_REGIME', stockSliceMetrics.byRegime),
        ...stockSliceStatsToSnapshots(runId, 'STOCK_VDU', stockSliceMetrics.byVduBand),
        ...stockSliceStatsToSnapshots(runId, 'STOCK_SCORE', stockSliceMetrics.byScoreBand),
        ...stockSliceStatsToSnapshots(runId, 'STOCK_DIRECTION', stockSliceMetrics.byDirection),
      ];
      for (const row of stockRows) {
        await prisma.backtestMetricSnapshot.create({ data: row });
      }
    }

    return metrics;
  }
}
