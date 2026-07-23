import {
  INDIA_VIX_CALM_MAX,
  INDIA_VIX_ELEVATED_MIN,
} from '../overnight/index-ranking.service';

export type VixBand = 'CALM' | 'NEUTRAL' | 'ELEVATED' | 'UNKNOWN';
export type IndexSliceStats = {
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancy: number;
  avgPnlPct: number;
};

export interface IndexBtstTradeContext {
  vixClose?: number;
  vixBand?: VixBand;
  regimeTrend?: string;
  regimeVolatility?: string;
  classification?: string;
}

export function classifyVixBand(vixClose: number | null | undefined): VixBand {
  if (vixClose === undefined || vixClose === null || Number.isNaN(vixClose)) {
    return 'UNKNOWN';
  }
  if (vixClose >= INDIA_VIX_ELEVATED_MIN) return 'ELEVATED';
  if (vixClose < INDIA_VIX_CALM_MAX) return 'CALM';
  return 'NEUTRAL';
}

export function parseIndexBtstTradeContext(
  signalsJson: string | null | undefined
): IndexBtstTradeContext {
  if (!signalsJson) return {};
  try {
    const parsed = JSON.parse(signalsJson) as {
      context?: IndexBtstTradeContext;
      classification?: string;
    };
    return {
      ...(parsed.context ?? {}),
      ...(parsed.classification ? { classification: parsed.classification } : {}),
    };
  } catch {
    return {};
  }
}

interface TradeLike {
  pnl?: number | null;
  pnlPercent?: number | null;
  status?: string;
  signalsJson?: string | null;
}

function aggregateSlice(trades: TradeLike[]): IndexSliceStats {
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

export function computeIndexBtstSliceMetrics(trades: TradeLike[]): {
  byVixBand: Record<string, IndexSliceStats>;
  byRegime: Record<string, IndexSliceStats>;
} {
  const vixBuckets = new Map<string, TradeLike[]>();
  const regimeBuckets = new Map<string, TradeLike[]>();

  for (const trade of trades) {
    const ctx = parseIndexBtstTradeContext(trade.signalsJson ?? null);
    const vixKey = ctx.vixBand ?? classifyVixBand(ctx.vixClose) ?? 'UNKNOWN';
    const regimeKey = ctx.regimeTrend ?? 'UNKNOWN';

    if (!vixBuckets.has(vixKey)) vixBuckets.set(vixKey, []);
    if (!regimeBuckets.has(regimeKey)) regimeBuckets.set(regimeKey, []);
    vixBuckets.get(vixKey)!.push(trade);
    regimeBuckets.get(regimeKey)!.push(trade);
  }

  const byVixBand: Record<string, IndexSliceStats> = {};
  const byRegime: Record<string, IndexSliceStats> = {};

  for (const [k, list] of vixBuckets) byVixBand[k] = aggregateSlice(list);
  for (const [k, list] of regimeBuckets) byRegime[k] = aggregateSlice(list);

  return { byVixBand, byRegime };
}

export function indexSliceStatsToSnapshots(
  runId: string,
  prefix: 'INDEX_VIX' | 'INDEX_REGIME',
  slices: Record<string, IndexSliceStats>
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
