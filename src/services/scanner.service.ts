import { calculateCPR } from '@/lib/cpr-engine';
import type { CPRResult } from '@/types/cpr.types';
import { getAtrPct } from '@/lib/atr';
import { safeRatio } from '@/lib/math';
import { VOLUME_THRESHOLDS } from '../config/trading-constants';
import { MarketStockData } from './market.service';
import { SignalService } from './signal.service';
import { RankingService } from './ranking.service';
import {
  isTodayCandleClosed,
  getISTDateString,
  getISTTime,
  getCompletedHistory,
  getOpeningRange,
  isOrbBreakout,
  type OpeningRange,
} from '@/lib/market-hours';
import { CprCompressionService, CprCompressionStats } from './cpr-compression.service';
import { BullishStateService } from './bullish-state.service';
import { VpaConfirmationService, buildVpaInputs } from '@/services/vpa';
import { isVpaEnabled, isVpaLiveConfidenceEnabled } from '@/config/vpa.config';
import type { VpaDirection } from '@/services/vpa';
import type { EventRiskResult } from './overnight/event.service';
import { applyBreakoutSignals, BREAKOUT_CONFIRM } from '@/lib/breakout-confirm';

export interface ScannerSignalResult extends MarketStockData {
  pivot: number;
  bc: number;
  tc: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  width: number;
  classification: 'NARROW' | 'NORMAL' | 'WIDE';
  signals: string[]; // Active signal tags
  score: number; // Quant score
  entry: number;
  sl: number;
  target: number;
  rr: string; // Risk-Reward ratio, e.g. "1:2.5"
  target2?: number | null;
  rr2?: string | null;
  confidence: number; // Trade confidence percentage
  tomorrowCPRProvisional?: boolean;
  degenerateData?: boolean;
  distPivot?: number;
  cprCompression?: CprCompressionStats | null;
  /** How many minutes ago this stock first entered its current bullish/bearish state today. */
  crossAgeMinutes?: number;
  /** Freshness classification of the current setup. */
  setupFreshness?: 'FRESH' | 'MATURE' | 'STALE';
  /** Session volume ÷ full-day average volume (raw, unadjusted — for audit & telemetry). */
  rawVolumeRatio: number;
  /** Pace-normalised volume ratio = rawVolumeRatio / expectedVolumeFraction(minuteOfDay). */
  volumeRatio: number;
  /** Shadow VPA confirmation — does not affect score unless VPA_LIVE_CONFIDENCE=true. */
  vpaBreakdown?: import('@/services/vpa').VpaConfirmationResult;
  eventRiskScore?: number;
  eventRiskReason?: string | null;
  /** Opening range high (from 15m candle or session fallback). null when CPR_PULLBACK. */
  orHigh?: number | null;
  /** Opening range low (from 15m candle or session fallback). null when CPR_PULLBACK. */
  orLow?: number | null;
  /** Opening range midpoint ((orHigh + orLow) / 2). null when CPR_PULLBACK. */
  orMidpoint?: number | null;
  /** Opening range width (orHigh - orLow). null when CPR_PULLBACK. */
  orRange?: number | null;
  /** Setup type: CPR_PULLBACK or ORB_BREAKOUT. */
  setupType?: SetupType;
}

export type SetupType = 'CPR_PULLBACK' | 'ORB_BREAKOUT';

export interface TradeSetupResult {
  entry: number;
  sl: number;
  target: number;
  rr: string;
  target2: number | null;
  rr2: string | null;
  bias: 'BULLISH' | 'BEARISH' | 'RANGE';
  isLongRange: boolean;
  /** Setup type: CPR_PULLBACK (entry at CPR TC/BC) or ORB_BREAKOUT (entry at OR boundary). */
  setupType: SetupType;
  /** Opening range used for the setup (null when CPR_PULLBACK). */
  openingRange: OpeningRange | null;
}

/** Maximum allowable stop-loss risk as a percentage of entry (guards against flash wicks). */
const MAX_SL_PCT = 0.03;

export class ScannerService {
  /**
   * Computes entry, stop loss, targets, and risk-reward geometry from CPR levels and current LTP.
   */
  public static computeTradeSetup(params: {
    ltp: number;
    cprToday: Pick<CPRResult, 'pivot' | 'bc' | 'tc' | 'r1' | 'r2' | 'r3' | 'r4' | 's1' | 's2' | 's3' | 's4'>;
    dayHigh: number;
    dayLow: number;
    /** Opening range from 15m candle (null = CPR-only setup). */
    openingRange?: OpeningRange | null;
    /** Pace-normalised volume ratio (required for ORB confirmation). */
    volumeRatio?: number;
    /** Raw volume ratio (session volume / 20D average). Dual-condition sanity floor (default 0.08). */
    rawVolumeRatio?: number;
    /** Minimum volume ratio for ORB confirmation (default BREAKOUT_RATIO = 1.5). */
    minVolumeRatio?: number;
  }): TradeSetupResult {
    const {
      ltp,
      cprToday,
      dayHigh,
      dayLow,
      openingRange = null,
      volumeRatio = 1,
      rawVolumeRatio,
      minVolumeRatio = VOLUME_THRESHOLDS.BREAKOUT_RATIO,
    } = params;
    let entry = 0;
    let sl = 0;
    let target = 0;
    let rr = '1:2.0';
    let target2: number | null = null;
    let rr2: string | null = null;
    let setupType: SetupType = 'CPR_PULLBACK';

    // Determine bias from LTP vs TODAY's CPR band
    let bias: 'BULLISH' | 'BEARISH' | 'RANGE' = 'RANGE';
    if (ltp > cprToday.tc) bias = 'BULLISH';
    else if (ltp < cprToday.bc) bias = 'BEARISH';
    let isLongRange = false;

    // ── ORB Entry Logic ───────────────────────────────────────────────────────
    // When an opening range exists and volume confirms (dual volume check),
    // prefer ORB entry anchored to OR boundary rather than CPR TC/BC.
    const orbDirection = openingRange
      ? isOrbBreakout(ltp, openingRange.orHigh, openingRange.orLow, volumeRatio, minVolumeRatio, rawVolumeRatio)
      : null;

    // Narrow openingRange to non-null when orbDirection is set
    const or = openingRange;

    if (orbDirection === 'LONG' && or) {
      // LONG ORB: entry at OR High, SL at OR Midpoint (conservative)
      entry = or.orHigh;
      // Cap ORB SL to MAX_SL_PCT (3.0%) below entry to guard against massive flash wicks,
      // and ensure minimum 0.5% buffer so risk > 0 even on flat/narrow opening ranges (see docs/decisions/orb-risk-buffer-memo.md).
      const midpointSL = or.orMidpoint;
      const minSL = entry * 0.995;
      const maxDistanceSL = entry * (1 - MAX_SL_PCT);
      sl = Math.max(Math.min(midpointSL, minSL), maxDistanceSL);
      setupType = 'ORB_BREAKOUT';
      bias = 'BULLISH';
      const risk = entry - sl;

      if (risk > 0) {
        // T1: 1.0R or next resistance; T2: 2.0R
        const targets = [cprToday.r1, cprToday.r2, cprToday.r3, cprToday.r4];
        let chosenTarget = Math.max(entry + risk * 1.0, ltp * 1.005); // fallback: 1:1 RR
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          if (t > entry && t > ltp && (t - entry) / risk >= 1.0) {
            chosenTarget = t;
            if (i + 1 < targets.length) {
              const nextTarget = targets[i + 1];
              target2 = nextTarget;
              rr2 = `1:${((nextTarget - entry) / risk).toFixed(1)}`;
            }
            break;
          }
        }
        target = chosenTarget;
        rr = `1:${((target - entry) / risk).toFixed(1)}`;
      } else {
        target = Math.max(entry * 1.01, ltp * 1.005);
        rr = '1:2.0';
      }
    } else if (orbDirection === 'SHORT' && or) {
      // SHORT ORB: entry at OR Low, SL at OR Midpoint (conservative)
      entry = or.orLow;
      // Cap ORB SL to MAX_SL_PCT (3.0%) above entry to guard against massive flash wicks,
      // and ensure minimum 0.5% buffer so risk > 0 even on flat/narrow opening ranges.
      const midpointSL = or.orMidpoint;
      const maxSL = entry * 1.005;
      const maxDistanceSL = entry * (1 + MAX_SL_PCT);
      sl = Math.min(Math.max(midpointSL, maxSL), maxDistanceSL);
      setupType = 'ORB_BREAKOUT';
      bias = 'BEARISH';
      const risk = sl - entry;

      if (risk > 0) {
        // T1: 1.0R or next support; T2: 2.0R
        const targets = [cprToday.s1, cprToday.s2, cprToday.s3, cprToday.s4];
        let chosenTarget = Math.min(entry - risk * 1.0, ltp * 0.995); // fallback: 1:1 RR
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          if (t < entry && t < ltp && (entry - t) / risk >= 1.0) {
            chosenTarget = t;
            if (i + 1 < targets.length) {
              const nextTarget = targets[i + 1];
              target2 = nextTarget;
              rr2 = `1:${((entry - nextTarget) / risk).toFixed(1)}`;
            }
            break;
          }
        }
        target = chosenTarget;
        rr = `1:${((entry - target) / risk).toFixed(1)}`;
      } else {
        target = Math.min(entry * 0.99, ltp * 0.995);
        rr = '1:2.0';
      }
    } else if (bias === 'BULLISH') {
      // LONG SETUP: pullback/hold entry at today's TC
      entry = cprToday.tc;
      // SL = day low OR minimum 0.5% below entry (whichever is lower)
      // L-04 fix: Cap SL distance to maximum MAX_SL_PCT (3.0%) of entry to guard against opening flash wicks
      const dayLowSL = dayLow;
      const minSL = entry * 0.995;
      const maxDistanceSL = entry * (1 - MAX_SL_PCT);
      sl = Math.max(Math.min(dayLowSL, minSL), maxDistanceSL);
      const risk = entry - sl;

      if (risk > 0) {
        // Find the first resistance level (R1 -> R2 -> R3 -> R4) that satisfies at least 1:1.5 RR
        // M-10 fix: Target must be ahead of both entry AND current LTP (t > entry && t > ltp)
        const targets = [cprToday.r1, cprToday.r2, cprToday.r3, cprToday.r4];
        let chosenTarget = Math.max(entry + risk * 1.5, ltp * 1.005); // fallback
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          if (t > entry && t > ltp && (t - entry) / risk >= 1.5) {
            chosenTarget = t;
            if (i + 1 < targets.length) {
              const nextTarget = targets[i + 1];
              target2 = nextTarget;
              rr2 = `1:${((nextTarget - entry) / risk).toFixed(1)}`;
            }
            break;
          }
        }
        target = chosenTarget;
        rr = `1:${((target - entry) / risk).toFixed(1)}`;
      } else {
        target = Math.max(entry * 1.01, ltp * 1.005);
        rr = '1:2.0';
      }
    } else if (bias === 'BEARISH') {
      // SHORT SETUP: bounce/hold entry at today's BC
      entry = cprToday.bc;
      // SL = day high OR minimum 0.5% above entry (whichever is higher)
      // L-04 fix: Cap SL distance to maximum MAX_SL_PCT (3.0%) of entry to guard against opening flash wicks
      const dayHighSL = dayHigh;
      const maxSL = entry * 1.005;
      const maxDistanceSL = entry * (1 + MAX_SL_PCT);
      sl = Math.min(Math.max(dayHighSL, maxSL), maxDistanceSL);
      const risk = sl - entry;

      if (risk > 0) {
        // Find the first support level (S1 -> S2 -> S3 -> S4) that satisfies at least 1:1.5 RR
        // M-10 fix: Target must be below both entry AND current LTP (t < entry && t < ltp)
        const targets = [cprToday.s1, cprToday.s2, cprToday.s3, cprToday.s4];
        let chosenTarget = Math.min(entry - risk * 1.5, ltp * 0.995); // fallback
        for (let i = 0; i < targets.length; i++) {
          const t = targets[i];
          if (t < entry && t < ltp && (entry - t) / risk >= 1.5) {
            chosenTarget = t;
            if (i + 1 < targets.length) {
              const nextTarget = targets[i + 1];
              target2 = nextTarget;
              rr2 = `1:${((entry - nextTarget) / risk).toFixed(1)}`;
            }
            break;
          }
        }
        target = chosenTarget;
        rr = `1:${((entry - target) / risk).toFixed(1)}`;
      } else {
        target = Math.min(entry * 0.99, ltp * 0.995);
        rr = '1:2.0';
      }
    } else {
      // RANGE SETUP — fade/mean-revert around today's pivot
      entry = cprToday.pivot;
      isLongRange = ltp >= cprToday.pivot;
      if (isLongRange) {
        sl = entry * 0.995;
        const risk = entry - sl;
        if (risk > 0) {
          const targets = [cprToday.r1, cprToday.r2, cprToday.r3, cprToday.r4];
          let chosenTarget = Math.max(entry + risk * 1.5, ltp * 1.005); // fallback
          for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (t > entry && t > ltp && (t - entry) / risk >= 1.5) {
              chosenTarget = t;
              if (i + 1 < targets.length) {
                const nextTarget = targets[i + 1];
                target2 = nextTarget;
                rr2 = `1:${((nextTarget - entry) / risk).toFixed(1)}`;
              }
              break;
            }
          }
          target = chosenTarget;
          rr = `1:${((target - entry) / risk).toFixed(1)}`;
        } else {
          target = Math.max(entry * 1.01, ltp * 1.005);
          rr = '1:2.0';
        }
      } else {
        sl = entry * 1.005;
        const risk = sl - entry;
        if (risk > 0) {
          const targets = [cprToday.s1, cprToday.s2, cprToday.s3, cprToday.s4];
          let chosenTarget = Math.min(entry - risk * 1.5, ltp * 0.995); // fallback
          for (let i = 0; i < targets.length; i++) {
            const t = targets[i];
            if (t < entry && t < ltp && (entry - t) / risk >= 1.5) {
              chosenTarget = t;
              if (i + 1 < targets.length) {
                const nextTarget = targets[i + 1];
                target2 = nextTarget;
                rr2 = `1:${((entry - nextTarget) / risk).toFixed(1)}`;
              }
              break;
            }
          }
          target = chosenTarget;
          rr = `1:${((entry - target) / risk).toFixed(1)}`;
        } else {
          target = Math.min(entry * 0.99, ltp * 0.995);
          rr = '1:2.0';
        }
      }
    }

    return {
      entry,
      sl,
      target,
      rr,
      target2,
      rr2,
      bias,
      isLongRange,
      setupType,
      openingRange: openingRange ?? null,
    };
  }

  /**
   * Evaluates all CPR levels, price-action signals, entry targets, and SL parameters.
   * Now async to fetch cached CPR compression history.
   */
  static async scanStock(stock: MarketStockData, asOfDate?: string, eventRisk?: EventRiskResult): Promise<ScannerSignalResult> {
    // Differentiate yesterday's and today's daily candles robustly
    const todayStr = asOfDate || getISTDateString();
    const isTradingSession = asOfDate ? true : getISTTime().isTradingDay;
    let yesterdayCandle = { high: stock.high, low: stock.low, close: stock.close };
    let todayCandle = { high: stock.high, low: stock.low, close: stock.ltp };

    let isLastToday = false;
    let isTodayCandleFinal = false;
    let degenerateData = false;
    if (!stock.history || stock.history.length === 0) {
      // No daily history — fabricating CPR from live quote alone is not tradable.
      console.warn(`[ScannerService] Degenerate CPR for ${stock.symbol} (empty history).`);
      degenerateData = true;
    } else if (stock.history.length > 0) {
      const lastCandle = stock.history[stock.history.length - 1];
      isLastToday = lastCandle.date === todayStr;
      
      isTodayCandleFinal = asOfDate 
        ? isLastToday 
        : (isLastToday && isTodayCandleClosed());
      
      if (!isTradingSession && !isLastToday) {
        // Weekend/holiday: last candle is the prior session. Do not fabricate a
        // live "today" bar from stale OHLC — use prior session as todayCandle
        // (next-session CPR) and the day before as yesterdayCandle (session CPR).
        todayCandle = lastCandle;
        yesterdayCandle = stock.history.length >= 2
          ? stock.history[stock.history.length - 2]
          : lastCandle;
        if (stock.history.length < 2) degenerateData = true;
      } else {
        todayCandle = isTodayCandleFinal ? lastCandle : {
          high: stock.high,
          low: stock.low,
          close: stock.ltp
        };
        
        if (stock.history.length < 2) {
          console.warn(`[ScannerService] Degenerate CPR for ${stock.symbol} (history length: ${stock.history.length}). Computed against itself.`);
          degenerateData = true;
        }
        
        yesterdayCandle = isLastToday 
          ? (stock.history.length >= 2 ? stock.history[stock.history.length - 2] : lastCandle)
          : lastCandle;
      }
    }

    const completedHistory = getCompletedHistory(stock.history || [], asOfDate);
    const atrRefClose = completedHistory.length
      ? completedHistory[completedHistory.length - 1].close
      : stock.close;
    const atrPct = getAtrPct(completedHistory, atrRefClose);

    // 1. Calculate Today's CPR using yesterday's OHLC
    const cprToday = calculateCPR({
      high: yesterdayCandle.high,
      low: yesterdayCandle.low,
      close: yesterdayCandle.close,
    }, atrPct);

    const tc = cprToday.tc;
    const bc = cprToday.bc;
    const ltp = stock.ltp;

    // 2. Fetch Advanced Signals
    const signalData = SignalService.getSignals(stock, asOfDate);
    const { signals, rawVolumeRatio, volumeRatio: signalVolumeRatio } = signalData;

    // ── Cross-Age / Setup Freshness Tracking ─────────────────────────────────
    // Records the FIRST TIME the stock entered this directional state today.
    // crossAgeMinutes = minutes since the setup first became valid.
    // This lets us reward early entries (FRESH) and penalise stale ones (STALE).
    let crossAgeMinutes: number | undefined;
    let setupFreshness: 'FRESH' | 'MATURE' | 'STALE' | undefined;

    // Only track during a live trading session with real history (skip backtests /
    // asOfDate runs and degenerate quote-only rows — freshness must not inflate score).
    if (!asOfDate && !degenerateData) {
      const ltpBias = ltp > tc ? 'BULLISH' : ltp < bc ? 'BEARISH' : null;
      if (ltpBias) {
        const stateEntry = await BullishStateService.recordState(stock.symbol, ltpBias);
        crossAgeMinutes = BullishStateService.ageMinutes(stateEntry);
        setupFreshness = BullishStateService.freshness(crossAgeMinutes);
        // Push freshness as a signal tag so scoring & UI can consume it
        if (setupFreshness === 'FRESH')  signals.push('FRESH_SETUP');
        else if (setupFreshness === 'MATURE') signals.push('MATURE_SETUP');
        else if (setupFreshness === 'STALE')  signals.push('STALE_SETUP');
      } else {
        // Price is inside the CPR band — clear any stored directional state
        await BullishStateService.clearState(stock.symbol);
      }
    } else if (degenerateData) {
      signals.push('DEGENERATE_DATA');
    }

    // Time/session breakout path after setup age is known (15m already applied in SignalService).
    // asOfDate (historical): grant reclaim-hold minutes so same-day structure can confirm;
    // gap continuation still needs the longer HOLD_MINUTES (not granted here).
    if (!degenerateData) {
      const volumeRatio = signalVolumeRatio;
      const holdForBreakout = asOfDate
        ? BREAKOUT_CONFIRM.RECLAIM_HOLD_MINUTES
        : (crossAgeMinutes ?? 0);
      applyBreakoutSignals(signals, volumeRatio, ltp, tc, bc, {
        open: stock.open,
        high: stock.high,
        low: stock.low,
        candle15m: stock.candle15m,
        holdMinutes: holdForBreakout,
        allowSessionReclaim: true,
        rawVolumeRatio,
      });
    }

    // 3. Trade Setup V3 — Entry, SL, Target, RR (bias/entry/sl/target/rr)
    // Step 3: Dual entry anchoring — CPR pullback (tc/bc) or ORB breakout (OR high/low).
    // INTENTIONALLY uses cprToday.* for entry/sl/target/rr — not cprTomorrow.*.
    // Do NOT revert to cprTomorrow.* without explicit owner approval —
    // see docs/decisions/cpr-entry-basis-2026-08-10.md (PR #98 / 9395ef5).
    const openingRange = getOpeningRange(
      stock.openingCandle15m ?? null,
      new Date(),
      asOfDate
    );
    const {
      entry,
      sl,
      target,
      rr,
      target2,
      rr2,
      bias,
      isLongRange,
      setupType,
      openingRange: computedOpeningRange,
    } = ScannerService.computeTradeSetup({
      ltp,
      cprToday,
      dayHigh: stock.high,
      dayLow: stock.low,
      openingRange,
      volumeRatio: signalVolumeRatio,
      rawVolumeRatio,
    });

    const computedEntry = Number(entry.toFixed(2));
    const computedSl = Number(sl.toFixed(2));
    const computedTarget = Number(target.toFixed(2));
    const computedTarget2 = target2 !== null ? Number(target2.toFixed(2)) : null;

    // 4. Calculate Quant Score & Classification (uses cprToday values and computed geometry)
    const tempResult: Omit<ScannerSignalResult, 'score' | 'confidence'> = {
      ...stock,
      pivot: cprToday.pivot,
      bc,
      tc,
      r1: cprToday.r1,
      r2: cprToday.r2,
      r3: cprToday.r3,
      r4: cprToday.r4,
      s1: cprToday.s1,
      s2: cprToday.s2,
      s3: cprToday.s3,
      s4: cprToday.s4,
      width: cprToday.width,
      classification: cprToday.classification,
      signals,
      rawVolumeRatio,
      volumeRatio: signalVolumeRatio,
      orHigh: computedOpeningRange?.orHigh ?? null,
      orLow: computedOpeningRange?.orLow ?? null,
      orMidpoint: computedOpeningRange?.orMidpoint ?? null,
      orRange: computedOpeningRange?.orRange ?? null,
      setupType,
      entry: computedEntry,
      sl: computedSl,
      target: computedTarget,
      rr,
      target2: computedTarget2,
      rr2,
    };
    const score = RankingService.calculateScore(tempResult);

    // Advanced CPR Analytics
    const cprCompression = await CprCompressionService.getStats(stock);
    const distPivot = safeRatio(ltp - cprToday.pivot, cprToday.pivot, 0) * 100;

    // 5. Confidence Score Calculation
    let confidence = this.calculateConfidence(tempResult);

    let vpaBreakdown: import('@/services/vpa').VpaConfirmationResult | undefined;
    if (isVpaEnabled()) {
      // Align VPA with Trade Setup V3 geometry (incl. RANGE short mean-revert).
      const vpaDirection: VpaDirection =
        bias === 'BEARISH' || (bias === 'RANGE' && !isLongRange) || signals.includes('BEARISH')
          ? 'SHORT'
          : 'LONG';
      const vpaInputs = buildVpaInputs(
        vpaDirection,
        {
          open: stock.open,
          high: todayCandle.high,
          low: todayCandle.low,
          close: ltp,
          volume: stock.volume,
          avgVolume: stock.avgVolume,
        },
        { bc: cprToday.bc, tc: cprToday.tc }
      );
      if (vpaInputs) {
        vpaBreakdown = VpaConfirmationService.analyze(vpaInputs);
        if (isVpaLiveConfidenceEnabled()) {
          confidence = VpaConfirmationService.applyConfidenceDelta(confidence, vpaBreakdown);
        }
      }
    }

    return {
      ...tempResult,
      score,
      confidence,
      entry: computedEntry,
      sl: computedSl,
      target: computedTarget,
      rr,
      target2: computedTarget2,
      rr2,
      tomorrowCPRProvisional: isTradingSession && !isTodayCandleFinal,
      degenerateData,
      distPivot: Number(distPivot.toFixed(2)),
      cprCompression,
      ...(crossAgeMinutes !== undefined && { crossAgeMinutes }),
      ...(setupFreshness !== undefined && { setupFreshness }),
      ...(vpaBreakdown ? { vpaBreakdown } : {}),
      eventRiskScore: eventRisk ? eventRisk.severity : 0,
      eventRiskReason: eventRisk ? eventRisk.reason : null,
    };
  }

  private static calculateConfidence(result: Omit<ScannerSignalResult, 'score' | 'confidence'>): number {
    const { signals, volumeRatio, width } = result;
    // volumeRatio is pace-normalised (rawVolumeRatio / expectedVolumeFraction) from SignalService.

    let confidence = 50; // base

    // 1. Liquidity / Volume Ratio (Max 20)
    if (volumeRatio >= VOLUME_THRESHOLDS.BREAKOUT_RATIO) {
      confidence += 20;
    } else if (volumeRatio >= VOLUME_THRESHOLDS.STRONG_RATIO) {
      confidence += 10;
    } else if (volumeRatio >= 1.0) {
      confidence += 6;
    }

    // 2. CPR Width / Volatility (Max 20)
    if (width <= 0.1) {
      confidence += 20;
    } else if (width <= 0.25) {
      confidence += 12;
    } else if (width <= 0.5) {
      confidence += 8;
    } else if (width <= 1.0) {
      confidence += 4;
    } else {
      confidence += 0;
    }

    // 3. Signal Quality Synergy (Max 20)
    // Accept HP_ (current) and legacy KGS_ (pre-rename journal/history rows).
    let synergy = 0;
    if (
      signals.includes('HP_INSIDE_CPR') || signals.includes('KGS_INSIDE_CPR') ||
      signals.includes('HP_RTP') || signals.includes('KGS_RTP')
    ) synergy += 10;
    if (signals.includes('VIRGIN')) synergy += 5;
    if (signals.includes('NARROW') && (signals.includes('BREAKOUT') || signals.includes('BREAKDOWN'))) synergy += 5;
    confidence += Math.min(20, synergy);

    // 4. Conflict Penalties
    let penalties = 0;
    if (
      (signals.includes('HP_ASC_CPR') || signals.includes('KGS_ASC_CPR')) &&
      signals.includes('BEARISH')
    ) penalties += 15;
    if (
      (signals.includes('HP_DESC_CPR') || signals.includes('KGS_DESC_CPR')) &&
      signals.includes('BULLISH')
    ) penalties += 15;
    if (signals.includes('HP_OUTSIDE_CPR') || signals.includes('KGS_OUTSIDE_CPR')) {
      penalties += 15;
    }

    confidence -= penalties;

    return Math.max(10, Math.min(confidence, 98));
  }
}

