import type { OHLC } from './historical.provider';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import { getCompletedHistory } from '@/lib/market-hours';
import { ADVANCED_SCORE, LIQUIDITY, VOLUME_THRESHOLDS } from '@/config/trading-constants';
import { BtstRankingService, type AdvancedScoreBreakdown } from '../overnight/btst-ranking.service';
import { StbtRankingService } from '../overnight/stbt-ranking.service';
import { EntryManagerService } from '../overnight/entry-manager.service';
import { resolveOvernightConflict } from '../overnight/overnight-conflict';
import { SignalQualityService } from '../overnight/signal-quality.service';
import type { EventRiskResult } from '../overnight/event.service';
import type { MarketRegime } from '../overnight/regime.service';
import type { MarketStockData } from '../market.service';
import {
  parseStockIntradayMetricsFromChart,
} from '../overnight/stock-intraday.util';
import {
  indexBtstDiscoveryAsOfUtc,
  type YahooFinanceChartResponse,
} from '../overnight/index-intraday.util';

const LONG_READY = ['STRONG_BTST', 'BTST_READY'] as const;
const SHORT_READY = ['STRONG_STBT', 'STBT_READY'] as const;

const NEUTRAL_EVENT = {
  severity: 0,
  reason: null,
  source: 'LOCAL_DB' as const,
  confidence: 'UNKNOWN' as const,
};

type OvernightSig = {
  score: number | null;
  cls: string;
  sl: number;
  target: number;
  scoreBreakdown: AdvancedScoreBreakdown | null;
};

export interface StockBtstDayContext {
  symbol: string;
  yesterday: OHLC;
  today: OHLC;
  /** Completed daily bars before `today`. */
  historyForAtr: OHLC[];
  chartJson: YahooFinanceChartResponse | null;
  asOfTime: Date;
  regime: MarketRegime;
  /** Backtest execution filter — mirrors run.executionMode. */
  directionFilter: 'LONG' | 'SHORT' | 'BOTH';
  /** Mirrors live discover — defaults to neutral when omitted (legacy tests). */
  stockEvent?: EventRiskResult;
  macroEvent?: EventRiskResult;
}

export interface StockBtstDayEvaluation {
  tradable: boolean;
  skipReason: string | null;
  direction: 'LONG' | 'SHORT' | null;
  score: number | null;
  longScore: number | null;
  shortScore: number | null;
  breakdown: AdvancedScoreBreakdown | null;
  classification: string;
  qualityBucket: string | null;
  volumeRatio: number | null;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
}

function notTradable(
  skipReason: string,
  partial: Partial<StockBtstDayEvaluation> = {}
): StockBtstDayEvaluation {
  return {
    tradable: false,
    skipReason,
    direction: null,
    score: null,
    longScore: null,
    shortScore: null,
    breakdown: null,
    classification: 'IGNORE',
    qualityBucket: null,
    volumeRatio: null,
    entry: null,
    stopLoss: null,
    target: null,
    ...partial,
  };
}

function rollingAvgVolume(history: OHLC[], fallback: number): number {
  const window = history.slice(Math.max(0, history.length - 20));
  if (window.length === 0) return fallback;
  return window.reduce((sum, d) => sum + d.volume, 0) / window.length;
}

/**
 * Evaluate one stock BTST/STBT setup day using the same contract as
 * OvernightService.discover() + selectTradableOvernightPicks (READY+ TRADEABLE).
 */
export function evaluateStockBtstDay(ctx: StockBtstDayContext): StockBtstDayEvaluation {
  const avgVolume = rollingAvgVolume(ctx.historyForAtr, ctx.today.volume);
  const volumeRatio = avgVolume > 0 ? ctx.today.volume / avgVolume : 1;

  const stock: MarketStockData = {
    symbol: ctx.symbol,
    market: 'NSE',
    sector: 'Unknown',
    open: ctx.today.open,
    high: ctx.today.high,
    low: ctx.today.low,
    close: ctx.today.close,
    volume: ctx.today.volume,
    avgVolume,
    marketCap: 0,
    ltp: ctx.today.close,
    previousClose: ctx.yesterday.close,
    history: [...ctx.historyForAtr, ctx.today],
  };

  if (ctx.historyForAtr.length < LIQUIDITY.MIN_HISTORY_FOR_RELIABLE_ATR) {
    return notTradable(
      `Insufficient history ${ctx.historyForAtr.length} < ${LIQUIDITY.MIN_HISTORY_FOR_RELIABLE_ATR}`,
      { volumeRatio }
    );
  }

  const intraday = parseStockIntradayMetricsFromChart(ctx.chartJson, ctx.asOfTime);
  const elig = EntryManagerService.evaluateEligibility(
    stock,
    intraday.vwap,
    intraday.intradayVolume,
    intraday.hasIntraday
  );
  if (!elig.eligible) {
    return notTradable(elig.reason ?? 'Eligibility gate failed', { volumeRatio });
  }

  const completedHistory = getCompletedHistory(stock.history ?? [], ctx.today.date);
  const atrPct = getAtrPct(
    completedHistory.length ? completedHistory : ctx.historyForAtr,
    ctx.yesterday.close
  );

  const todayCpr = calculateCPR(
    { high: ctx.yesterday.high, low: ctx.yesterday.low, close: ctx.yesterday.close },
    atrPct
  );
  const tomorrowCpr = calculateCPR(
    { high: ctx.today.high, low: ctx.today.low, close: ctx.today.close },
    atrPct
  );

  const scoreInputsBase = {
    volume: ctx.today.volume,
    avgVolume,
    tomorrowCprNarrow: tomorrowCpr.classification === 'NARROW',
    tomorrowBc: tomorrowCpr.bc,
    tomorrowTc: tomorrowCpr.tc,
    todayBc: todayCpr.bc,
    todayTc: todayCpr.tc,
    close: ctx.today.close,
    high: ctx.today.high,
    low: ctx.today.low,
    vwap: intraday.vwap,
    intradayVolume: intraday.intradayVolume,
    hasConfirmationCandles: intraday.hasIntraday,
  };

  let longSig: OvernightSig | null = null;
  let shortSig: OvernightSig | null = null;

  if (ctx.directionFilter === 'LONG' || ctx.directionFilter === 'BOTH') {
    const details = BtstRankingService.calculateScoreDetails({
      ...scoreInputsBase,
      last15mHigh: intraday.last15mHigh,
    });
    const score = details.score;
    longSig = {
      score,
      cls: BtstRankingService.getClassification(score),
      sl: Math.min(ctx.today.low, tomorrowCpr.bc),
      target:
        ctx.today.close +
        Math.max((ctx.today.close - Math.min(ctx.today.low, tomorrowCpr.bc)) * 2.5, ctx.today.close * 0.05),
      scoreBreakdown: details.breakdown,
    };
  }

  if (ctx.directionFilter === 'SHORT' || ctx.directionFilter === 'BOTH') {
    const details = StbtRankingService.calculateScoreDetails({
      ...scoreInputsBase,
      last15mLow: intraday.last15mLow,
    });
    const score = details.score;
    shortSig = {
      score,
      cls: StbtRankingService.getClassification(score),
      sl: Math.max(ctx.today.high, tomorrowCpr.tc),
      target:
        ctx.today.close -
        Math.max((Math.max(ctx.today.high, tomorrowCpr.tc) - ctx.today.close) * 2.5, ctx.today.close * 0.05),
      scoreBreakdown: details.breakdown,
    };
  }

  const conflict = resolveOvernightConflict(longSig, shortSig);
  const finalDir = conflict.finalDir;
  const finalSig = conflict.finalSig;

  if (!finalDir || !finalSig || finalSig.score === null) {
    return notTradable('No eligible direction after conflict resolution', {
      longScore: longSig?.score ?? null,
      shortScore: shortSig?.score ?? null,
      volumeRatio,
    });
  }

  if (conflict.finalCls === 'NEUTRAL_CONFLICT') {
    return notTradable('NEUTRAL_CONFLICT — scores too close', {
      longScore: longSig?.score ?? null,
      shortScore: shortSig?.score ?? null,
      volumeRatio,
    });
  }

  if (finalDir === 'SHORT' && ctx.regime.trend === 'BULL') {
    return notTradable('BULL regime — stock SHORT suppressed', {
      longScore: longSig?.score ?? null,
      shortScore: shortSig?.score ?? null,
      volumeRatio,
    });
  }
  if (finalDir === 'LONG' && ctx.regime.trend === 'BEAR') {
    return notTradable('BEAR regime — stock LONG suppressed', {
      longScore: longSig?.score ?? null,
      shortScore: shortSig?.score ?? null,
      volumeRatio,
    });
  }

  const ext = EntryManagerService.evaluateExtension(stock, finalDir, ctx.today.date);
  if (!ext.eligible) {
    return notTradable(ext.reason ?? 'Extension gate failed', {
      longScore: longSig?.score ?? null,
      shortScore: shortSig?.score ?? null,
      volumeRatio,
    });
  }

  const classification = finalSig.cls;
  const score = finalSig.score;
  const readyList =
    finalDir === 'LONG'
      ? (LONG_READY as readonly string[])
      : (SHORT_READY as readonly string[]);

  if (!readyList.includes(classification)) {
    return notTradable(
      `Classification ${classification} (need READY+ >= ${ADVANCED_SCORE.READY}/${ADVANCED_SCORE.MAX})`,
      {
        direction: finalDir,
        score,
        longScore: longSig?.score ?? null,
        shortScore: shortSig?.score ?? null,
        breakdown: (finalSig.scoreBreakdown as AdvancedScoreBreakdown | null) ?? null,
        classification,
        volumeRatio,
      }
    );
  }

  if (score < ADVANCED_SCORE.READY) {
    return notTradable(
      `Score ${score} < READY floor ${ADVANCED_SCORE.READY}`,
      {
        direction: finalDir,
        score,
        longScore: longSig?.score ?? null,
        shortScore: shortSig?.score ?? null,
        breakdown: (finalSig.scoreBreakdown as AdvancedScoreBreakdown | null) ?? null,
        classification,
        volumeRatio,
      }
    );
  }

  const quality = SignalQualityService.evaluateSignal(
    stock,
    finalDir,
    longSig?.score ?? 0,
    shortSig?.score ?? 0,
    ctx.regime,
    stock.history?.length ?? 0,
    ctx.stockEvent ?? NEUTRAL_EVENT,
    ctx.macroEvent ?? NEUTRAL_EVENT,
    0
  );

  if (quality.qualityBucket !== 'TRADEABLE') {
    return notTradable(
      `Quality bucket ${quality.qualityBucket} (need TRADEABLE)`,
      {
        direction: finalDir,
        score,
        longScore: longSig?.score ?? null,
        shortScore: shortSig?.score ?? null,
        breakdown: (finalSig.scoreBreakdown as AdvancedScoreBreakdown | null) ?? null,
        classification,
        qualityBucket: quality.qualityBucket,
        volumeRatio,
      }
    );
  }

  const sl = finalSig.sl;
  const target = finalSig.target;
  if (sl <= 0) {
    return notTradable('Degenerate SL', { direction: finalDir, score, volumeRatio });
  }
  if (finalDir === 'LONG' && target <= ctx.today.close) {
    return notTradable('Degenerate LONG target', { direction: finalDir, score, volumeRatio });
  }
  if (finalDir === 'SHORT' && target >= ctx.today.close) {
    return notTradable('Degenerate SHORT target', { direction: finalDir, score, volumeRatio });
  }

  return {
    tradable: true,
    skipReason: null,
    direction: finalDir,
    score,
    longScore: longSig?.score ?? null,
    shortScore: shortSig?.score ?? null,
    breakdown: (finalSig.scoreBreakdown as AdvancedScoreBreakdown | null) ?? null,
    classification,
    qualityBucket: quality.qualityBucket,
    volumeRatio,
    entry: ctx.today.close,
    stopLoss: sl,
    target,
  };
}

/** Classify VDU band for slice metrics (post 1.5× eligibility gate). */
export function classifyVduBand(volumeRatio: number | null | undefined): string {
  if (volumeRatio == null || Number.isNaN(volumeRatio)) return 'UNKNOWN';
  if (volumeRatio >= VOLUME_THRESHOLDS.SPIKE_RATIO) return 'SPIKE_2X+';
  if (volumeRatio >= VOLUME_THRESHOLDS.BREAKOUT_RATIO) return 'VDU_1.5-2.0';
  return 'BELOW_1.5';
}

export function classifyScoreBand(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return 'UNKNOWN';
  if (score >= ADVANCED_SCORE.STRONG) return 'STRONG_100+';
  if (score >= ADVANCED_SCORE.READY) return 'READY_85-99';
  if (score >= ADVANCED_SCORE.WATCH) return 'WATCH_70-84';
  return 'BELOW_70';
}

/** Default discovery cutoff — 15:25 IST (same as index BTST). */
export { indexBtstDiscoveryAsOfUtc as stockBtstDiscoveryAsOfUtc };
