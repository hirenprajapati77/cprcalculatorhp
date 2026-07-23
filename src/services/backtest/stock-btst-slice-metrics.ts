import { ADVANCED_SCORE } from '@/config/trading-constants';
import {
  classifyScoreBand,
  classifyVduBand,
} from './stock-btst-backtest.helper';

export type StockSliceStats = {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  avgPnlPct: number;
};

export interface StockBtstTradeContext {
  regimeTrend?: string;
  regimeVolatility?: string;
  classification?: string;
  qualityBucket?: string;
  volumeRatio?: number;
  vduBand?: string;
  direction?: string;
}

export function parseStockBtstTradeContext(
  signalsJson: string | null | undefined
): StockBtstTradeContext {
  if (!signalsJson) return {};
  try {
    const parsed = JSON.parse(signalsJson) as {
      context?: StockBtstTradeContext;
      classification?: string;
      tag?: string;
    };
    return {
      ...(parsed.context ?? {}),
      ...(parsed.classification ? { classification: parsed.classification } : {}),
      ...(parsed.tag ? { direction: parsed.tag } : {}),
    };
  } catch {
    return {};
  }
}

interface TradeLike {
  pnl?: number | null;
  pnlPercent?: number | null;
  status?: string;
  type?: string;
  score?: number | null;
  signalsJson?: string | null;
}

function aggregateSlice(trades: TradeLike[]): StockSliceStats {
  let wins = 0;
  let losses = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let pnlPctSum = 0;
  let pnlPctCount = 0;

  for (const t of trades) {
    if (t.status === 'OPEN' || t.status === 'NEVER_TRIGGERED') continue;
    const pnl = t.pnl ?? 0;
    if (pnl > 0) {
      wins++;
      grossProfit += pnl;
    } else if (pnl < 0) {
      losses++;
      grossLoss += Math.abs(pnl);
    }
    if (t.pnlPercent != null) {
      pnlPctSum += t.pnlPercent;
      pnlPctCount++;
    }
  }

  const count = wins + losses;
  const winRate = count > 0 ? (wins / count) * 100 : 0;
  const lossRate = count > 0 ? (losses / count) * 100 : 0;
  const avgWin = wins > 0 ? grossProfit / wins : 0;
  const avgLoss = losses > 0 ? grossLoss / losses : 0;
  const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;

  return {
    count,
    wins,
    losses,
    winRate,
    expectancy,
    avgPnlPct: pnlPctCount > 0 ? pnlPctSum / pnlPctCount : 0,
  };
}

function bucketTrades(
  trades: TradeLike[],
  keyFn: (ctx: StockBtstTradeContext, trade: TradeLike) => string
): Record<string, StockSliceStats> {
  const buckets = new Map<string, TradeLike[]>();
  for (const trade of trades) {
    const ctx = parseStockBtstTradeContext(trade.signalsJson ?? null);
    const key = keyFn(ctx, trade);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(trade);
  }
  const out: Record<string, StockSliceStats> = {};
  for (const [k, list] of buckets) out[k] = aggregateSlice(list);
  return out;
}

export function computeStockBtstSliceMetrics(trades: TradeLike[]): {
  byRegime: Record<string, StockSliceStats>;
  byVduBand: Record<string, StockSliceStats>;
  byScoreBand: Record<string, StockSliceStats>;
  byDirection: Record<string, StockSliceStats>;
} {
  return {
    byRegime: bucketTrades(trades, (ctx) => ctx.regimeTrend ?? 'UNKNOWN'),
    byVduBand: bucketTrades(trades, (ctx) =>
      ctx.vduBand ?? classifyVduBand(ctx.volumeRatio)
    ),
    byScoreBand: bucketTrades(trades, (_ctx, trade) =>
      classifyScoreBand(trade.score ?? undefined)
    ),
    byDirection: bucketTrades(trades, (ctx, trade) =>
      ctx.direction ?? trade.type ?? 'UNKNOWN'
    ),
  };
}

export function stockSliceStatsToSnapshots(
  runId: string,
  prefix: 'STOCK_REGIME' | 'STOCK_VDU' | 'STOCK_SCORE' | 'STOCK_DIRECTION',
  slices: Record<string, StockSliceStats>
): Array<{
  backtestRunId: string;
  period: string;
  metricType: string;
  metricKey: string;
  metricValue: number;
}> {
  const rows: Array<{
    backtestRunId: string;
    period: string;
    metricType: string;
    metricKey: string;
    metricValue: number;
  }> = [];

  for (const [key, stats] of Object.entries(slices)) {
    rows.push(
      {
        backtestRunId: runId,
        period: 'ALL',
        metricType: `${prefix}_WINRATE`,
        metricKey: key,
        metricValue: stats.winRate,
      },
      {
        backtestRunId: runId,
        period: 'ALL',
        metricType: `${prefix}_EXPECTANCY`,
        metricKey: key,
        metricValue: stats.expectancy,
      },
      {
        backtestRunId: runId,
        period: 'ALL',
        metricType: `${prefix}_COUNT`,
        metricKey: key,
        metricValue: stats.count,
      },
      {
        backtestRunId: runId,
        period: 'ALL',
        metricType: `${prefix}_AVG_PNL_PCT`,
        metricKey: key,
        metricValue: stats.avgPnlPct,
      }
    );
  }

  return rows;
}
