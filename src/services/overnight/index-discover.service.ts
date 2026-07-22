/**
 * Phase 1 index discovery — deliberately isolated from OvernightService.
 * INTRA Phase 2: live LTP + index-specific symmetric scorer (see index-intra-ranking.service.ts).
 * Fixed instrument list (NIFTY, BANKNIFTY), no F&O universe loop, no
 * EntryManagerService liquidity gate (that gate exists for stock
 * avgVolume/volumeRatio concerns that don't apply to an index).
 *
 * Reuses the same building blocks as the stock pipeline where they're
 * genuinely shared (calculateCPR, getAtrPct, HistoricalProvider), but does
 * not import from or modify overnight.service.ts, btst-ranking.service.ts,
 * stbt-ranking.service.ts, or entry-manager.service.ts.
 */
import { env } from '@/config/env';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import {
  getISTDateString,
  getISTTime,
  BTST_CLOCK,
  BTST_WINDOW_MINUTES,
  isInClosingLiquidityWindow,
  istMinuteOfDayFromUnixSec,
} from '@/lib/market-hours';
import { HistoricalProvider, OHLC } from '../backtest/historical.provider';
import {
  IndexRankingService,
  IndexClassification,
  IndexScoreBreakdown,
  INDEX_SCORE,
  INDIA_VIX_CALM_MAX,
  INDIA_VIX_ELEVATED_MIN,
} from './index-ranking.service';
import { IndexIntraRankingService, INDEX_INTRA_SCORE } from './index-intra-ranking.service';
import { IndexRegimeService, IndexRegimeContext } from './index-regime.service';
import {
  resolveSignalType,
  buildBtstReasons,
  buildIntraReasons,
  computeRiskReward,
  IndexSignalType,
} from './index-signal.util';
import { SignalService } from '../signal.service';
import { MarketStockData } from '../market.service';

export interface IndexInstrument {
  /** Display/storage symbol, e.g. "NIFTY". */
  symbol: string;
  /** Yahoo Finance symbol, e.g. "^NSEI" — caret prefix means HistoricalProvider
   *  and the intraday fetch below skip the ".NS" suffix used for stocks. */
  yahooSymbol: string;
}

export const INDEX_INSTRUMENTS: IndexInstrument[] = [
  { symbol: 'NIFTY', yahooSymbol: '^NSEI' },
  { symbol: 'BANKNIFTY', yahooSymbol: '^NSEBANK' },
];

export interface IndexSignalResult {
  symbol: string;
  signalDate: string;
  signalTime: string;
  direction: 'LONG' | 'SHORT';
  /** Raw CPR score before regime adjustment (classification gate). */
  score: number | null;
  /** Score after regime boost/penalty — displayed as confidence. */
  confidence: number | null;
  classification: IndexClassification;
  /** CALL BUY / PUT BUY / NO_TRADE — options-native signal label. */
  signalType: IndexSignalType;
  entry: number | null;
  stopLoss: number | null;
  target: number | null;
  riskReward: string | null;
  scoreBreakdown: IndexScoreBreakdown | null;
  reasons: string[];
  regime: IndexRegimeContext | null;
}

interface IndexIntradayMetrics {
  vwap: number | null;
  hasIntraday: boolean;
  last15mHigh: number | null;
}

/** Live index session from Yahoo chart meta + 5m aggregation (Phase 2 INTRA). */
export interface LiveIndexSession {
  ltp: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  hasLive: boolean;
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
}

export interface IndiaVixState {
  /** True when latest VIX close >= INDIA_VIX_ELEVATED_MIN — overnight LONG forced IGNORE. */
  elevated: boolean;
  /**
   * true → award Rule 1 calm pts; false → scoreable but no calm pts;
   * null → unavailable / mock (score-safety INVALID).
   */
  vixCalm: boolean | null;
}

interface YahooFinanceChartResponse {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta;
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
  };
}

export class IndexDiscoverService {
  private static buildSignalResult(
    partial: Omit<
      IndexSignalResult,
      'signalType' | 'confidence' | 'riskReward' | 'scoreBreakdown' | 'reasons' | 'regime'
    > & {
      scoreBreakdown?: IndexScoreBreakdown | null;
      reasons: string[];
      regime: IndexRegimeContext | null;
      maxScore?: number;
    }
  ): IndexSignalResult {
    const maxScore = partial.maxScore ?? INDEX_SCORE.MAX;
    const confidence = IndexRegimeService.applyConfidence(
      partial.score,
      partial.regime?.adjustment ?? 0,
      maxScore
    );
    const signalType = resolveSignalType(partial.direction, partial.classification);
    const entry = partial.entry;
    const stopLoss = partial.stopLoss;
    const target = partial.target;

    return {
      symbol: partial.symbol,
      signalDate: partial.signalDate,
      signalTime: partial.signalTime,
      direction: partial.direction,
      score: partial.score,
      confidence,
      classification: partial.classification,
      signalType,
      entry,
      stopLoss,
      target,
      riskReward: computeRiskReward(entry, stopLoss, target),
      scoreBreakdown: partial.scoreBreakdown ?? null,
      reasons: partial.reasons,
      regime: partial.regime,
    };
  }

  private static ignoreResult(
    symbol: string,
    signalDate: string,
    signalTime: string,
    direction: 'LONG' | 'SHORT',
    reasons: string[],
    regime: IndexRegimeContext | null
  ): IndexSignalResult {
    return this.buildSignalResult({
      symbol,
      signalDate,
      signalTime,
      direction,
      score: null,
      classification: 'IGNORE',
      entry: null,
      stopLoss: null,
      target: null,
      reasons,
      regime,
    });
  }
  /**
   * Fetches intraday 5m data for VWAP + last-15m high (15:15–15:30 IST),
   * matching OvernightService's closing-liquidity window logic.
   * On any failure, returns hasIntraday: false so the caller's score-safety
   * check returns a null score rather than guessing.
   */
  private static async getIntradayMetrics(
    yahooSymbol: string,
    currentTime: Date
  ): Promise<IndexIntradayMetrics> {
    const mode = env.HISTORICAL_MODE || 'mock';
    if (mode !== 'live') {
      // Mock mode: no live VWAP / last15m source. Score-safety will correctly
      // return null scores — expected and matches the stock mock path.
      return { vwap: null, hasIntraday: false, last15mHigh: null };
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&range=1d`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      let json: YahooFinanceChartResponse;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Live fetch HTTP ${response.status}`);
        json = (await response.json()) as YahooFinanceChartResponse;
      } finally {
        clearTimeout(timeout);
      }

      const result = json?.chart?.result?.[0];
      const timestamps = result?.timestamp;
      const quotes = result?.indicators?.quote?.[0];
      if (!result || !timestamps || !quotes || !quotes.high || !quotes.low || !quotes.close || !quotes.volume) {
        return { vwap: null, hasIntraday: false, last15mHigh: null };
      }

      const currentTimestampSec = Math.floor(currentTime.getTime() / 1000);
      let sumPriceVol = 0;
      let sumVol = 0;
      let hasIntraday = false;
      let closingHigh = 0;
      let closingBarCount = 0;

      const lastTimestamp = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
      const isLastCandleForming = currentTimestampSec - lastTimestamp < 300;

      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        if (ts > currentTimestampSec) continue;
        const high = quotes.high[i];
        const low = quotes.low[i];
        const close = quotes.close[i];
        const volume = quotes.volume[i] || 0;
        if (high == null || low == null || close == null) continue;

        const typicalPrice = (high + low + close) / 3;
        sumPriceVol += typicalPrice * volume;
        sumVol += volume;
        hasIntraday = true;

        const barOpenMin = istMinuteOfDayFromUnixSec(ts);
        const inClosingWindow = isInClosingLiquidityWindow(barOpenMin);
        const isFormingBar = isLastCandleForming && ts === lastTimestamp;
        // Include forming bar when it belongs to the 15:15–15:30 window (partial MOC data).
        if (inClosingWindow && (!isFormingBar || barOpenMin >= BTST_WINDOW_MINUTES.CLOSING_WINDOW_START)) {
          closingHigh = Math.max(closingHigh, high);
          closingBarCount++;
        }
      }

      const last15mHigh =
        closingBarCount > 0 && closingHigh > 0 ? closingHigh : null;

      // Index futures volume can be legitimately thin/zero on the underlying
      // spot chart depending on source; fall back to a simple average price
      // (not volume-weighted) if volume is unavailable but candles exist,
      // rather than discarding real price data.
      if (hasIntraday && sumVol === 0) {
        let sumClose = 0;
        let count = 0;
        for (let i = 0; i < timestamps.length; i++) {
          if (timestamps[i] > currentTimestampSec) continue;
          const close = quotes.close[i];
          if (close == null) continue;
          sumClose += close;
          count++;
        }
        return {
          vwap: count > 0 ? sumClose / count : null,
          hasIntraday: count > 0,
          last15mHigh,
        };
      }

      return {
        vwap: sumVol > 0 ? sumPriceVol / sumVol : null,
        hasIntraday,
        last15mHigh,
      };
    } catch (err) {
      console.warn(`[IndexDiscover] Intraday fetch failed for ${yahooSymbol}:`, err instanceof Error ? err.message : err);
      return { vwap: null, hasIntraday: false, last15mHigh: null };
    }
  }

  /**
   * Phase 2 — live index LTP + today's session OHLC from Yahoo chart.
   * Uses meta.regularMarketPrice when available; aggregates 5m bars as fallback.
   * Mock mode returns hasLive: false so callers fall back to completed daily bars.
   */
  static async getLiveIndexSession(
    yahooSymbol: string,
    currentTime: Date
  ): Promise<LiveIndexSession> {
    const empty: LiveIndexSession = {
      ltp: null,
      open: null,
      high: null,
      low: null,
      previousClose: null,
      hasLive: false,
    };

    const mode = env.HISTORICAL_MODE || 'mock';
    if (mode !== 'live') {
      return empty;
    }

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=5m&range=1d`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      let json: YahooFinanceChartResponse;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Live fetch HTTP ${response.status}`);
        json = (await response.json()) as YahooFinanceChartResponse;
      } finally {
        clearTimeout(timeout);
      }

      const result = json?.chart?.result?.[0];
      const meta = result?.meta;
      const timestamps = result?.timestamp;
      const quotes = result?.indicators?.quote?.[0];
      if (!result) return empty;

      const previousClose =
        meta?.chartPreviousClose ?? meta?.previousClose ?? null;

      const currentTimestampSec = Math.floor(currentTime.getTime() / 1000);
      const todayStr = getISTDateString(currentTime);

      let barOpen: number | null = null;
      let barHigh = 0;
      let barLow = Number.POSITIVE_INFINITY;
      let barClose: number | null = null;
      let barCount = 0;

      if (timestamps && quotes?.open && quotes.high && quotes.low && quotes.close) {
        for (let i = 0; i < timestamps.length; i++) {
          const ts = timestamps[i];
          if (ts > currentTimestampSec) continue;
          const candleDate = getISTTime(new Date(ts * 1000)).dateString;
          if (candleDate !== todayStr) continue;

          const open = quotes.open[i];
          const high = quotes.high[i];
          const low = quotes.low[i];
          const close = quotes.close[i];
          if (open == null || high == null || low == null || close == null) continue;

          if (barOpen == null) barOpen = open;
          barHigh = Math.max(barHigh, high);
          barLow = Math.min(barLow, low);
          barClose = close;
          barCount++;
        }
      }

      const ltp = meta?.regularMarketPrice ?? barClose ?? null;
      const open = meta?.regularMarketOpen ?? barOpen ?? null;
      const high = meta?.regularMarketDayHigh ?? (barCount > 0 ? barHigh : null);
      const low =
        meta?.regularMarketDayLow ??
        (barCount > 0 && barLow < Number.POSITIVE_INFINITY ? barLow : null);

      if (ltp == null || open == null || high == null || low == null || previousClose == null) {
        return empty;
      }

      return {
        ltp,
        open,
        high: Math.max(high, ltp),
        low: Math.min(low, ltp),
        previousClose,
        hasLive: true,
      };
    } catch (err) {
      console.warn(
        `[IndexDiscover] Live session fetch failed for ${yahooSymbol}:`,
        err instanceof Error ? err.message : err
      );
      return empty;
    }
  }

  /**
   * Index INTRA: emit breakdown/build tags from live price vs CPR without volume.
   */
  private static augmentIndexIntraSignals(
    signals: string[],
    direction: 'LONG' | 'SHORT',
    ltp: number,
    bc: number,
    tc: number,
    sessionMovePct: number
  ): string[] {
    const tags = new Set(signals);
    if (direction === 'SHORT' && ltp < bc && sessionMovePct <= -0.005) {
      tags.add('BREAKDOWN');
      if (sessionMovePct <= -0.01) tags.add('SHORT_BUILD');
    }
    if (direction === 'LONG' && ltp > tc && sessionMovePct >= 0.005) {
      tags.add('BREAKOUT');
      if (sessionMovePct >= 0.01) tags.add('LONG_BUILD');
    }
    return Array.from(tags);
  }

  /**
   * India VIX regime for overnight LONG gating / Rule 1 calm points.
   * - elevated (close >= 25): discover forces IGNORE
   * - calm (close < 20): award 25 pts
   * - otherwise: scoreable, calm=false (no calm pts)
   * - mock / unavailable: vixCalm null → score-safety INVALID
   */
  static async getIndiaVixState(date: Date): Promise<IndiaVixState> {
    const mode = env.HISTORICAL_MODE || 'mock';
    if (mode !== 'live') {
      return { elevated: false, vixCalm: null };
    }

    try {
      const endDateObj = new Date(date);
      const startDateObj = new Date(date);
      startDateObj.setDate(startDateObj.getDate() - 30);

      const history = await HistoricalProvider.getHistory('^INDIAVIX', startDateObj, endDateObj);
      if (!history || history.length === 0) {
        return { elevated: false, vixCalm: null };
      }

      const latestClose = history[history.length - 1].close;
      if (latestClose >= INDIA_VIX_ELEVATED_MIN) {
        return { elevated: true, vixCalm: false };
      }
      if (latestClose < INDIA_VIX_CALM_MAX) {
        return { elevated: false, vixCalm: true };
      }
      return { elevated: false, vixCalm: false };
    } catch (err) {
      console.warn(
        '[IndexDiscover] India VIX fetch failed:',
        err instanceof Error ? err.message : err
      );
      return { elevated: false, vixCalm: null };
    }
  }

  /**
   * Scans the fixed index instrument list and returns scored LONG signals.
   * Never persists to the database — callers decide whether/how to store
   * (kept out of this file so Stage 1 has zero Prisma dependency).
   */
  static async discover(dateOverride?: Date): Promise<IndexSignalResult[]> {
    const currentTime = dateOverride || new Date();
    const dateStr = getISTDateString(currentTime);
    // Stable per-day signalTime so OvernightSignal upserts update one row
    // per index/day instead of inserting a new row on every refresh minute.
    const timeStr = BTST_CLOCK.discoveryStart;

    const results: IndexSignalResult[] = [];
    const vixState = await this.getIndiaVixState(currentTime);
    const marketRegime = await IndexRegimeService.getMarketRegime(dateStr);
    const longRegime = IndexRegimeService.computeAdjustment('LONG', marketRegime);

    for (const instrument of INDEX_INSTRUMENTS) {
      try {
        // Elevated VIX: force IGNORE with null score/levels — do not invent setups.
        if (vixState.elevated) {
          results.push(
            this.ignoreResult(
              instrument.symbol,
              dateStr,
              timeStr,
              'LONG',
              buildBtstReasons(null, true, longRegime),
              longRegime
            )
          );
          continue;
        }

        const endDateObj = new Date(currentTime);
        const startDateObj = new Date(currentTime);
        startDateObj.setDate(startDateObj.getDate() - 90);

        const history = await HistoricalProvider.getHistory(instrument.yahooSymbol, startDateObj, endDateObj);

        if (!history || history.length < 15) {
          console.warn(`[IndexDiscover] ${instrument.symbol} skipped: insufficient history (${history?.length ?? 0} candles).`);
          continue;
        }

        const { isTradingDay } = getISTTime(currentTime);
        if (!isTradingDay) {
          continue;
        }

        // Same today/yesterday candle selection intent as OvernightService:
        // the most recent completed candle is "today", the one before it is
        // "yesterday" — Phase 1 always works off completed daily bars (no
        // in-progress-candle handling yet, since index EOD data settles
        // cleanly via HistoricalProvider unlike the stock live-quote path).
        const todayCandle = history[history.length - 1];
        const yesterdayCandle = history[history.length - 2];

        const atrPct = getAtrPct(history.slice(0, -1), yesterdayCandle.close);

        const todayCpr = calculateCPR(
          { high: yesterdayCandle.high, low: yesterdayCandle.low, close: yesterdayCandle.close },
          atrPct
        );
        const tomorrowCpr = calculateCPR(
          { high: todayCandle.high, low: todayCandle.low, close: todayCandle.close },
          atrPct
        );

        const intraday = await this.getIntradayMetrics(instrument.yahooSymbol, currentTime);

        const details = IndexRankingService.calculateScoreDetails({
          tomorrowCprNarrow: tomorrowCpr.classification === 'NARROW',
          tomorrowBc: tomorrowCpr.bc,
          tomorrowTc: tomorrowCpr.tc,
          todayBc: todayCpr.bc,
          todayTc: todayCpr.tc,
          close: todayCandle.close,
          high: todayCandle.high,
          low: todayCandle.low,
          vwap: intraday.vwap,
          last15mHigh: intraday.last15mHigh,
          vixCalm: vixState.vixCalm,
          hasConfirmationCandles: intraday.hasIntraday,
        });

        const cls = IndexRankingService.getClassification(details.score);
        const sl = Math.min(todayCandle.low, tomorrowCpr.bc);
        const risk = todayCandle.close - sl;
        const target = risk > 0 ? todayCandle.close + risk * 2 : null;
        const reasons = buildBtstReasons(details.breakdown, false, longRegime);

        results.push(
          this.buildSignalResult({
            symbol: instrument.symbol,
            signalDate: dateStr,
            signalTime: timeStr,
            direction: 'LONG',
            score: details.score,
            classification: cls,
            entry: details.score !== null ? todayCandle.close : null,
            stopLoss: details.score !== null ? sl : null,
            target: details.score !== null ? target : null,
            scoreBreakdown: details.breakdown,
            reasons,
            regime: longRegime,
            maxScore: INDEX_SCORE.MAX,
          })
        );
      } catch (err) {
        console.error(`[IndexDiscover] Error scanning ${instrument.symbol}:`, err instanceof Error ? err.message : err);
      }
    }

    return results;
  }

  /**
   * Map INTRA CPR scores onto INDEX_* using INDEX_INTRA_SCORE floors (75 / 60 / 40).
   * BTST rows use IndexRankingService.getClassification (100 / 85 / 70 on max 130).
   */
  static mapIntraClassification(score: number): IndexClassification {
    return IndexIntraRankingService.getClassification(score);
  }

  /**
   * Scans the fixed index instrument list and returns scored INTRA signals.
   * Phase 2: live LTP + session OHLC; index-specific symmetric scorer.
   */
  static async discoverIntraday(dateOverride?: Date): Promise<IndexSignalResult[]> {
    const currentTime = dateOverride || new Date();
    const dateStr = getISTDateString(currentTime);
    const timeStr = currentTime.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const { isTradingDay } = getISTTime(currentTime);
    if (!isTradingDay) {
      return [];
    }

    const results: IndexSignalResult[] = [];
    const vixState = await this.getIndiaVixState(currentTime);
    const marketRegime = await IndexRegimeService.getMarketRegime(dateStr);

    for (const instrument of INDEX_INSTRUMENTS) {
      try {
        // Elevated VIX: same hard gate as BTST — block intraday option signals.
        if (vixState.elevated) {
          const regimeCtx = IndexRegimeService.computeAdjustment('LONG', marketRegime);
          results.push(
            this.ignoreResult(
              instrument.symbol,
              dateStr,
              timeStr,
              'LONG',
              buildIntraReasons([], 'LONG', true, regimeCtx),
              regimeCtx
            )
          );
          continue;
        }
        const endDateObj = new Date(currentTime);
        const startDateObj = new Date(currentTime);
        startDateObj.setDate(startDateObj.getDate() - 90);

        const history = await HistoricalProvider.getHistory(instrument.yahooSymbol, startDateObj, endDateObj);

        if (!history || history.length < 15) {
          continue;
        }

        const live = await this.getLiveIndexSession(instrument.yahooSymbol, currentTime);
        const lastCandle = history[history.length - 1];
        const previousClose =
          live.hasLive && live.previousClose != null
            ? live.previousClose
            : history.length >= 2
              ? history[history.length - 2].close
              : lastCandle.close;

        const ltp = live.hasLive && live.ltp != null ? live.ltp : lastCandle.close;
        const open = live.hasLive && live.open != null ? live.open : lastCandle.open;
        const high = live.hasLive && live.high != null ? live.high : lastCandle.high;
        const low = live.hasLive && live.low != null ? live.low : lastCandle.low;

        const sessionMovePct =
          previousClose > 0 ? (ltp - previousClose) / previousClose : 0;

        const stockData: MarketStockData = {
          symbol: instrument.symbol,
          market: 'NSE',
          sector: 'INDEX',
          ltp,
          open,
          high,
          low,
          close: ltp,
          volume: 0,
          avgVolume: 0,
          marketCap: 0,
          previousClose,
          history: history as OHLC[],
        };

        const signalResult = SignalService.getSignals(stockData);

        const bullish = signalResult.signals.includes('BULLISH');
        const bearish = signalResult.signals.includes('BEARISH');
        // Do not invent LONG when price is inside CPR with no directional tag.
        if (!bullish && !bearish) {
          const regimeCtx = IndexRegimeService.computeAdjustment('LONG', marketRegime);
          results.push(
            this.ignoreResult(
              instrument.symbol,
              dateStr,
              timeStr,
              'LONG',
              ['Price inside CPR — no directional bias'],
              regimeCtx
            )
          );
          continue;
        }

        const direction: 'LONG' | 'SHORT' = bullish ? 'LONG' : 'SHORT';

        const atrPct = getAtrPct(history.slice(0, -1), previousClose);
        const cprSourceCandle = lastCandle;
        const realCpr = calculateCPR(
          { high: cprSourceCandle.high, low: cprSourceCandle.low, close: cprSourceCandle.close },
          atrPct
        );

        const intraSignals = this.augmentIndexIntraSignals(
          signalResult.signals,
          direction,
          ltp,
          realCpr.bc,
          realCpr.tc,
          sessionMovePct
        );

        const score = IndexIntraRankingService.calculateScore(
          intraSignals,
          direction,
          sessionMovePct
        );

        const regimeCtx = IndexRegimeService.computeAdjustment(direction, marketRegime);
        const classification = this.mapIntraClassification(score);

        const intraReasons = buildIntraReasons(intraSignals, direction, false, regimeCtx);
        if (live.hasLive) {
          intraReasons.unshift(`Live index LTP (${sessionMovePct >= 0 ? '+' : ''}${(sessionMovePct * 100).toFixed(2)}% vs prev close)`);
        }

        // IGNORE setups must not advertise entry/SL/target (matches BTST score-safety UX).
        if (classification === 'IGNORE') {
          results.push(
            this.buildSignalResult({
              symbol: instrument.symbol,
              signalDate: dateStr,
              signalTime: timeStr,
              direction,
              score,
              classification,
              entry: null,
              stopLoss: null,
              target: null,
              reasons: intraReasons,
              regime: regimeCtx,
              maxScore: INDEX_INTRA_SCORE.MAX,
            })
          );
          continue;
        }

        // LONG enters near TC / SHORT near BC — never reuse TC for both sides.
        const entry = direction === 'LONG' ? realCpr.tc : realCpr.bc;
        const sl = direction === 'LONG' ? realCpr.bc : realCpr.tc;
        const target = direction === 'LONG' ? realCpr.r1 : realCpr.s1;

        results.push(
          this.buildSignalResult({
            symbol: instrument.symbol,
            signalDate: dateStr,
            signalTime: timeStr,
            direction,
            score,
            classification,
            entry,
            stopLoss: sl,
            target,
            reasons: intraReasons,
            regime: regimeCtx,
            maxScore: INDEX_INTRA_SCORE.MAX,
          })
        );
      } catch (err) {
        console.error(`[IndexDiscover] Error scanning INTRA for ${instrument.symbol}:`, err);
      }
    }

    return results;
  }
}
