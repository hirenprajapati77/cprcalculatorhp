import type { OHLC } from './historical.provider';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import {
  IndexRankingService,
  INDEX_SCORE,
  INDIA_VIX_CALM_MAX,
  INDIA_VIX_ELEVATED_MIN,
  isIndexBtstRedSession,
  type IndexClassification,
  type IndexScoreBreakdown,
} from '../overnight/index-ranking.service';
import {
  parseIndexIntradayMetricsFromChart,
  type YahooFinanceChartResponse,
} from '../overnight/index-intraday.util';

/** Liquidity tier for index slippage (NIFTY/BANKNIFTY/SENSEX). */
export const INDEX_BACKTEST_AVG_VOLUME = 5_000_000;

const INDEX_LONG_TRADABLE: IndexClassification[] = ['INDEX_STRONG', 'INDEX_READY'];

export interface IndexBtstDayContext {
  yesterday: OHLC;
  today: OHLC;
  /** Completed daily bars before `today` (excludes in-progress today if appended). */
  historyForAtr: OHLC[];
  vixClose: number | null | undefined;
  /** Matches live Telegram/journal: suppress index LONG when NIFTY regime is BEAR. */
  suppressLongBear: boolean;
  chartJson: YahooFinanceChartResponse | null;
  asOfTime: Date;
}

export interface IndexBtstDayEvaluation {
  tradable: boolean;
  skipReason: string | null;
  score: number | null;
  breakdown: IndexScoreBreakdown | null;
  classification: IndexClassification;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
}

export function resolveIndexVixCalm(
  vixClose: number | null | undefined
): { elevated: boolean; vixCalm: boolean | null } {
  if (vixClose === undefined || vixClose === null) {
    return { elevated: false, vixCalm: null };
  }
  if (vixClose >= INDIA_VIX_ELEVATED_MIN) {
    return { elevated: true, vixCalm: false };
  }
  if (vixClose < INDIA_VIX_CALM_MAX) {
    return { elevated: false, vixCalm: true };
  }
  return { elevated: false, vixCalm: false };
}

/**
 * Evaluate one index BTST setup day using the same scoring contract as
 * IndexDiscoverService.discover() + selectTradableIndexBtstPicks (READY+).
 */
export function evaluateIndexBtstDay(ctx: IndexBtstDayContext): IndexBtstDayEvaluation {
  const notTradable = (
    skipReason: string,
    classification: IndexClassification = 'IGNORE',
    score: number | null = null,
    breakdown: IndexScoreBreakdown | null = null
  ): IndexBtstDayEvaluation => ({
    tradable: false,
    skipReason,
    score,
    breakdown,
    classification,
    entry: null,
    stopLoss: null,
    target: null,
  });

  if (ctx.suppressLongBear) {
    return notTradable('BEAR regime — index LONG suppressed (live alert/journal path)');
  }

  const sessionChangePct =
    ctx.yesterday.close > 0
      ? (ctx.today.close - ctx.yesterday.close) / ctx.yesterday.close
      : 0;
  if (isIndexBtstRedSession(sessionChangePct)) {
    return notTradable(
      `Red session ${(sessionChangePct * 100).toFixed(2)}% vs prev close`
    );
  }

  const { elevated, vixCalm } = resolveIndexVixCalm(ctx.vixClose);
  if (ctx.vixClose === undefined || ctx.vixClose === null) {
    return notTradable('Missing ^INDIAVIX for date (score invalid)');
  }
  if (elevated) {
    return notTradable(`India VIX elevated (${ctx.vixClose.toFixed(2)} >= ${INDIA_VIX_ELEVATED_MIN})`);
  }

  const intraday = parseIndexIntradayMetricsFromChart(ctx.chartJson, ctx.asOfTime);

  const atrPct = getAtrPct(
    ctx.historyForAtr.length ? ctx.historyForAtr : [ctx.yesterday],
    ctx.yesterday.close
  );

  const todayCpr = calculateCPR(
    {
      high: ctx.yesterday.high,
      low: ctx.yesterday.low,
      close: ctx.yesterday.close,
    },
    atrPct
  );
  const tomorrowCpr = calculateCPR(
    {
      high: ctx.today.high,
      low: ctx.today.low,
      close: ctx.today.close,
    },
    atrPct
  );

  const details = IndexRankingService.calculateScoreDetails({
    tomorrowCprNarrow: tomorrowCpr.classification === 'NARROW',
    tomorrowBc: tomorrowCpr.bc,
    tomorrowTc: tomorrowCpr.tc,
    todayBc: todayCpr.bc,
    todayTc: todayCpr.tc,
    close: ctx.today.close,
    high: ctx.today.high,
    low: ctx.today.low,
    vwap: intraday.vwap,
    last15mHigh: intraday.last15mHigh,
    vixCalm,
    hasConfirmationCandles: intraday.hasIntraday,
  });

  const classification = IndexRankingService.getClassification(details.score);
  const score = details.score;

  if (score === null) {
    return notTradable('Score invalid — missing intraday VWAP/last15m or VIX', classification);
  }

  if (!INDEX_LONG_TRADABLE.includes(classification)) {
    return notTradable(
      `Classification ${classification} (score ${score}/${INDEX_SCORE.MAX}, need READY+ >= ${INDEX_SCORE.READY})`,
      classification,
      score,
      details.breakdown
    );
  }

  if (score < INDEX_SCORE.READY) {
    return notTradable(
      `Score ${score} < READY floor ${INDEX_SCORE.READY}`,
      classification,
      score,
      details.breakdown
    );
  }

  const sl = Math.min(ctx.today.low, tomorrowCpr.bc);
  const risk = ctx.today.close - sl;
  if (risk <= 0) {
    return notTradable('Degenerate SL/risk', classification, score, details.breakdown);
  }
  const target = ctx.today.close + risk * 2;

  return {
    tradable: true,
    skipReason: null,
    score,
    breakdown: details.breakdown,
    classification,
    entry: ctx.today.close,
    stopLoss: sl,
    target,
  };
}
