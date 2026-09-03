import { prisma } from '@/lib/db';
import { cache } from '@/lib/redis';
import { isLikelyEtfOrFund } from '@/lib/nse-fund-exclusion';
import { FNO_SYMBOLS, getSymbolSector } from './market-breadth.service';
import {
  computeClv,
  computeRvol,
  computeRangePct,
  classifyBreakoutVpa,
  BreakoutVpaFootprint,
} from '@/services/vpa/vpa.math';

export type MomentumTier = 'A+' | 'A' | 'B' | 'C';

export interface WindowReturnMetric {
  returnPct: number;
  rank: number;
  percentile: number;
  isLeader: boolean; // percentile >= 85.0
}

export interface MomentumStock {
  symbol: string;
  sector: string;
  close: number;
  prevClose: number;
  changePct: number;
  volume: number;
  turnoverCr: number;
  avgTurnoverCr20d: number;
  rvol20d: number | null;
  clv: number | null;
  vpaFootprint: BreakoutVpaFootprint;
  windows: {
    w1d: WindowReturnMetric;   // 1 trading session
    w5d: WindowReturnMetric;   // 5 trading sessions (~1 week)
    w10d: WindowReturnMetric;  // 10 trading sessions (~2 weeks)
    w21d: WindowReturnMetric;  // 21 trading sessions (~1 month)
  };
  leaderWindowCount: number; // 0 to 4
  baseScore: number;
  consistencyBonus: number;
  dispersionPenalty: number;
  vpaModifier: number;
  compositeScore: number; // 0 to 100
  tier: MomentumTier;
  isCircuitLocked: boolean;
  circuitLimitPct: number | null;
}

export type MomentumUniverse = 'ALL_NSE' | 'NSE_FNO';

export interface MomentumLeadersReport {
  date: string;
  universe: MomentumUniverse;
  totalScanned: number;
  qualifiedCount: number;
  countsByTier: {
    'A+': number;
    A: number;
    B: number;
    C: number;
  };
  countsByLeaderWindows: {
    '4_windows': number;
    '3_windows': number;
    '2_windows': number;
    '1_window': number;
    '0_windows': number;
  };
  topLeaders: MomentumStock[];
  allStocks: MomentumStock[];
  computedAt: string;
  status: 'ready' | 'pending';
}

export interface OhlcvCandleWithPrevClose {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  volume: number;
  value?: number | null;
}

const cachedReports: Partial<Record<MomentumUniverse, MomentumLeadersReport>> = {};
const lastComputedTimes: Partial<Record<MomentumUniverse, number>> = {};
let inFlightCompute: Promise<Record<MomentumUniverse, MomentumLeadersReport>> | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REDIS_KEY_PREFIX = 'market_tools:momentum_leaders:report';
const REDIS_TTL_SEC = 24 * 3600; // 24 hours

export class MomentumLeadersService {
  /**
   * Minimum 20-day average daily turnover required for a stock to qualify (in ₹ Cr).
   * Stocks below this floor are excluded before percentile ranking.
   */
  public static readonly MIN_LIQUIDITY_TURNOVER_CR = 10.0;

  /** Standard NSE circuit filter thresholds (in %). */
  public static readonly CIRCUIT_THRESHOLDS = [5.0, 10.0, 20.0];

  /** Tolerance for circuit lock approximation (in %). E.g., +19.99% is within 0.20% of 20.0%. */
  public static readonly CIRCUIT_TOLERANCE_PCT = 0.20;

  /**
   * Detects if a stock's 1D return lands within tolerance of a standard NSE circuit band (5%, 10%, 20%).
   * Flagging circuit-locked stocks alerts traders to potential illiquidity or limit-up/limit-down traps.
   */
  public static detectCircuitLock(
    changePct: number,
    tolerance = MomentumLeadersService.CIRCUIT_TOLERANCE_PCT
  ): {
    isCircuitLocked: boolean;
    circuitLimitPct: number | null;
  } {
    const absChange = Math.abs(changePct);
    for (const threshold of MomentumLeadersService.CIRCUIT_THRESHOLDS) {
      const diff = Math.abs(absChange - threshold);
      if (diff <= tolerance + 1e-6) {
        return {
          isCircuitLocked: true,
          circuitLimitPct: threshold,
        };
      }
    }
    return {
      isCircuitLocked: false,
      circuitLimitPct: null,
    };
  }

  /**
   * Computes trailing average daily turnover in ₹ Cr from historical candles.
   * Uses the prior `period` trading sessions leading up to (and excluding) the current session.
   */
  public static computeTrailingAvgTurnoverCr(candles: OhlcvCandleWithPrevClose[], period = 20): number {
    if (candles.length < 2) {
      if (candles.length === 1) {
        const c = candles[0]!;
        const cr = c.value !== undefined && c.value !== null
          ? c.value / 10000000
          : (c.volume * c.close) / 10000000;
        return Number(cr.toFixed(2));
      }
      return 0;
    }
    const window = candles.slice(-(period + 1), -1);
    if (window.length === 0) return 0;
    const sum = window.reduce((acc, c) => {
      const cr = c.value !== undefined && c.value !== null
        ? c.value / 10000000
        : (c.volume * c.close) / 10000000;
      return acc + cr;
    }, 0);
    return Number((sum / window.length).toFixed(2));
  }
  /**
   * Validates whether a previous close price is a finite, positive number.
   */
  public static isValidPrevClose(val: unknown): val is number {
    return typeof val === 'number' && Number.isFinite(val) && val > 0;
  }

  /**
   * Compounded return across k trading sessions using exchange-adjusted prevClose.
   * Immunizes multi-window returns against stock splits, bonuses, and capital restructuring.
   * Returns null if any candle in the requested window has an invalid, missing, zero, or negative prevClose.
   */
  static computeCompoundedReturn(candles: OhlcvCandleWithPrevClose[], k: number): number | null {
    if (candles.length < k || k <= 0) return 0;
    const window = candles.slice(-k);
    let compoundRatio = 1.0;

    for (const c of window) {
      if (!MomentumLeadersService.isValidPrevClose(c.prevClose) || !Number.isFinite(c.close) || c.close <= 0) {
        return null;
      }
      const dailyReturn = (c.close - c.prevClose) / c.prevClose;
      compoundRatio *= (1.0 + dailyReturn);
    }

    return Number(((compoundRatio - 1.0) * 100).toFixed(2));
  }

  /**
   * Bounded Additive Momentum Score calculation (max 100).
   * - Base Momentum: 0.85 * weighted_percentile (0 to 85.0 pts)
   * - Consistency Bonus: 2.5 * leader_windows (0 to 10.0 pts)
   * - Dispersion Penalty: -0.10 * sample_std(percentiles)
   * - VPA Modifier: +5 (CONFIRMED/ABSORPTION), 0 (NEUTRAL), -3 (NO_DEMAND), -10 (CLIMAX_REJECT)
   */
  static calculateCompositeScore(params: {
    p1d: number;
    p5d: number;
    p10d: number;
    p21d: number;
    vpaModifier: number;
  }): {
    baseScore: number;
    consistencyBonus: number;
    dispersionPenalty: number;
    vpaModifier: number;
    compositeScore: number;
    leaderWindowCount: number;
    tier: MomentumTier;
  } {
    const { p1d, p5d, p10d, p21d, vpaModifier } = params;

    const basePercentile = 0.15 * p1d + 0.25 * p5d + 0.30 * p10d + 0.30 * p21d;
    const baseScore = Number((0.85 * basePercentile).toFixed(2));

    let leaderWindowCount = 0;
    if (p1d >= 85.0) leaderWindowCount++;
    if (p5d >= 85.0) leaderWindowCount++;
    if (p10d >= 85.0) leaderWindowCount++;
    if (p21d >= 85.0) leaderWindowCount++;

    const consistencyBonus = Number((2.5 * leaderWindowCount).toFixed(2));

    const meanP = (p1d + p5d + p10d + p21d) / 4;
    const varianceP = (
      Math.pow(p1d - meanP, 2) +
      Math.pow(p5d - meanP, 2) +
      Math.pow(p10d - meanP, 2) +
      Math.pow(p21d - meanP, 2)
    ) / 3;
    const sampleStd = Math.sqrt(varianceP);
    const dispersionPenalty = Number((0.10 * sampleStd).toFixed(2));

    const rawScore = baseScore + consistencyBonus - dispersionPenalty + vpaModifier;
    const compositeScore = Math.min(100, Math.max(0, Math.round(rawScore)));

    let tier: MomentumTier = 'C';
    if (compositeScore >= 90) tier = 'A+';
    else if (compositeScore >= 80) tier = 'A';
    else if (compositeScore >= 65) tier = 'B';

    return {
      baseScore,
      consistencyBonus,
      dispersionPenalty,
      vpaModifier,
      compositeScore,
      leaderWindowCount,
      tier,
    };
  }

  /**
   * Return cached Momentum Leaders report for requested universe, or compute on-demand.
   */
  static async getMomentumLeadersReport(
    forceRefresh = false,
    universe: MomentumUniverse = 'NSE_FNO'
  ): Promise<MomentumLeadersReport> {
    const now = Date.now();
    const currentMemory = cachedReports[universe];
    const currentComputedTime = lastComputedTimes[universe] || 0;

    if (!forceRefresh && currentMemory && now - currentComputedTime < CACHE_TTL_MS) {
      return currentMemory;
    }

    const redisKey = `${REDIS_KEY_PREFIX}:${universe}`;

    if (!forceRefresh) {
      try {
        const redisCached = await cache.get(redisKey);
        if (redisCached) {
          const parsed = JSON.parse(redisCached) as MomentumLeadersReport;
          cachedReports[universe] = parsed;
          lastComputedTimes[universe] = now;
          return parsed;
        }
      } catch {
        // Fall back to compute on cache miss/error
      }
    }

    if (inFlightCompute) {
      const reports = await inFlightCompute;
      return reports[universe];
    }

    inFlightCompute = MomentumLeadersService.computeAllMomentumLeadersReports()
      .then(async (reports) => {
        const computedTime = Date.now();
        cachedReports['ALL_NSE'] = reports.ALL_NSE;
        cachedReports['NSE_FNO'] = reports.NSE_FNO;
        lastComputedTimes['ALL_NSE'] = computedTime;
        lastComputedTimes['NSE_FNO'] = computedTime;

        try {
          await Promise.all([
            cache.set(`${REDIS_KEY_PREFIX}:ALL_NSE`, JSON.stringify(reports.ALL_NSE), REDIS_TTL_SEC),
            cache.set(`${REDIS_KEY_PREFIX}:NSE_FNO`, JSON.stringify(reports.NSE_FNO), REDIS_TTL_SEC),
            cache.set(REDIS_KEY_PREFIX, JSON.stringify(reports.NSE_FNO), REDIS_TTL_SEC), // Legacy alias
          ]);
        } catch {
          // Non-critical cache write error
        }
        return reports;
      })
      .finally(() => {
        inFlightCompute = null;
      });

    const reports = await inFlightCompute;
    return reports[universe];
  }

  /**
   * Computes Multi-Window Momentum Leaders across ALL_NSE and NSE_FNO universes.
   * Runs single DB pass against series='EQ' DailyOhlcv, applies the ₹10 Cr liquidity gate,
   * then computes percentile ranks and composite scores independently for each universe.
   */
  static async computeAllMomentumLeadersReports(): Promise<Record<MomentumUniverse, MomentumLeadersReport>> {
    // 1. Fetch available trading dates sorted descending
    const dateRows = await prisma.$queryRaw<Array<{ date: string }>>`
      SELECT DISTINCT date FROM "DailyOhlcv" 
      WHERE series = 'EQ' 
      ORDER BY date DESC 
      LIMIT 40
    `;

    if (dateRows.length === 0) {
      throw new Error('No data available in DailyOhlcv table');
    }

    const latestDate = dateRows[0]!.date;
    const oldestDate = dateRows[Math.min(dateRows.length - 1, 30)]!.date;

    // 2. Fetch trailing candles for all series='EQ' symbols
    const candleRows = await prisma.$queryRaw<
      Array<{
        symbol: string;
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        prevClose: number;
        volume: bigint | number;
        value: number | null;
      }>
    >`
      SELECT symbol, date, open, high, low, close, "prevClose", volume, value
      FROM "DailyOhlcv"
      WHERE series = 'EQ'
        AND date >= ${oldestDate}
        AND date <= ${latestDate}
      ORDER BY symbol ASC, date ASC
    `;

    const candleMap = new Map<string, OhlcvCandleWithPrevClose[]>();
    for (const r of candleRows) {
      let list = candleMap.get(r.symbol);
      if (!list) {
        list = [];
        candleMap.set(r.symbol, list);
      }
      list.push({
        date: r.date,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        prevClose: Number(r.prevClose),
        volume: Number(r.volume),
        value: r.value !== null ? Number(r.value) : null,
      });
    }

    // 3. Count total scanned per universe
    const allSymbols = Array.from(candleMap.keys()).filter(sym => !isLikelyEtfOrFund(sym));
    const totalScannedAllNse = allSymbols.length;
    const totalScannedNseFno = allSymbols.filter(sym => FNO_SYMBOLS.has(sym)).length;

    // 4. Calculate returns, VPA, and apply ₹10 Cr Liquidity Base Gate across full pool
    const fullLiquidityGatedPool: RawStockAnalysis[] = [];

    for (const symbol of allSymbols) {
      const candles = candleMap.get(symbol);
      if (!candles || candles.length < 22) continue; // Must have at least 21 historical days + current day

      const latestCandle = candles[candles.length - 1]!;
      if (latestCandle.date !== latestDate) continue; // Must be actively traded today

      const close = latestCandle.close;
      const prevClose = latestCandle.prevClose;
      const changePct = prevClose > 0 ? Number((((close - prevClose) / prevClose) * 100).toFixed(2)) : 0;
      const volume = latestCandle.volume;
      const turnoverCr = latestCandle.value
        ? Number((latestCandle.value / 10000000).toFixed(2))
        : Number(((volume * close) / 10000000).toFixed(2));

      // 20-day trailing volume for RVOL
      const prior20Candles = candles.slice(-21, -1);
      const avgVol20 = prior20Candles.length > 0
        ? prior20Candles.reduce((s, c) => s + c.volume, 0) / prior20Candles.length
        : volume;

      // 20-day trailing average daily turnover (₹ Cr) for liquidity base gate
      const avgTurnoverCr20d = MomentumLeadersService.computeTrailingAvgTurnoverCr(candles, 20);

      // Liquidity Base Gate: Exclude stocks with 20-day average daily turnover < ₹10 Cr
      // Applies identically regardless of universe tab selected
      if (avgTurnoverCr20d < MomentumLeadersService.MIN_LIQUIDITY_TURNOVER_CR) {
        continue;
      }

      const rvol20d = computeRvol(volume, avgVol20);
      const clv = computeClv(close, latestCandle.high, latestCandle.low);
      const rangePct = computeRangePct(latestCandle.high, latestCandle.low, close);
      const vpaFootprint = classifyBreakoutVpa(rvol20d, clv, rangePct);

      // Compounded returns
      const r1d = MomentumLeadersService.computeCompoundedReturn(candles, 1);
      const r5d = MomentumLeadersService.computeCompoundedReturn(candles, 5);
      const r10d = MomentumLeadersService.computeCompoundedReturn(candles, 10);
      const r21d = MomentumLeadersService.computeCompoundedReturn(candles, 21);

      // Whole-stock exclusion: if any window contains invalid prevClose data,
      // exclude the stock from ranking rather than computing partial or corrupted returns.
      if (r1d === null || r5d === null || r10d === null || r21d === null) {
        console.warn(
          `[MomentumLeaders] Excluding ${symbol} from ranking due to invalid prevClose in historical candles (r1d=${r1d}, r5d=${r5d}, r10d=${r10d}, r21d=${r21d})`
        );
        continue;
      }

      const circuitInfo = MomentumLeadersService.detectCircuitLock(changePct);

      fullLiquidityGatedPool.push({
        symbol,
        sector: getSymbolSector(symbol),
        close,
        prevClose,
        changePct,
        volume,
        turnoverCr,
        avgTurnoverCr20d,
        rvol20d,
        clv,
        vpaFootprint,
        r1d,
        r5d,
        r10d,
        r21d,
        isCircuitLocked: circuitInfo.isCircuitLocked,
        circuitLimitPct: circuitInfo.circuitLimitPct,
      });
    }

    // 5. Partition pools and compute ranks independently
    const poolAllNse = fullLiquidityGatedPool;
    const poolNseFno = fullLiquidityGatedPool.filter(s => FNO_SYMBOLS.has(s.symbol));

    const reportAllNse = MomentumLeadersService.buildUniverseReport(
      poolAllNse,
      'ALL_NSE',
      totalScannedAllNse,
      latestDate
    );

    const reportNseFno = MomentumLeadersService.buildUniverseReport(
      poolNseFno,
      'NSE_FNO',
      totalScannedNseFno,
      latestDate
    );

    return {
      ALL_NSE: reportAllNse,
      NSE_FNO: reportNseFno,
    };
  }

  /**
   * Helper to compute single universe report directly (used by unit tests and scheduler).
   */
  static async computeMomentumLeadersReport(universe: MomentumUniverse = 'NSE_FNO'): Promise<MomentumLeadersReport> {
    const reports = await MomentumLeadersService.computeAllMomentumLeadersReports();
    return reports[universe];
  }

  /**
   * Builds a MomentumLeadersReport for a specific candidate pool.
   * Percentiles and ranks are calculated strictly within this pool's population.
   */
  public static buildUniverseReport(
    rawStocks: RawStockAnalysis[],
    universe: MomentumUniverse,
    totalScanned: number,
    latestDate: string
  ): MomentumLeadersReport {
    const N = rawStocks.length;
    if (N === 0) {
      return {
        date: latestDate,
        universe,
        totalScanned,
        qualifiedCount: 0,
        countsByTier: { 'A+': 0, A: 0, B: 0, C: 0 },
        countsByLeaderWindows: {
          '4_windows': 0,
          '3_windows': 0,
          '2_windows': 0,
          '1_window': 0,
          '0_windows': 0,
        },
        topLeaders: [],
        allStocks: [],
        computedAt: new Date().toISOString(),
        status: 'ready',
      };
    }

    // Compute percentile ranks per window against this universe pool
    function rankWindow(extractReturn: (s: RawStockAnalysis) => number): Map<string, { rank: number; percentile: number }> {
      const sorted = [...rawStocks].sort(
        (a, b) => extractReturn(b) - extractReturn(a) || a.symbol.localeCompare(b.symbol)
      );
      const map = new Map<string, { rank: number; percentile: number }>();
      let prevReturn: number | null = null;
      let prevRank = 1;
      let prevPercentile = 100;

      sorted.forEach((item, idx) => {
        const currentReturn = extractReturn(item);
        if (prevReturn !== null && currentReturn === prevReturn) {
          map.set(item.symbol, { rank: prevRank, percentile: prevPercentile });
        } else {
          const rank = idx + 1;
          const percentile = Number((N > 1 ? ((N - rank) / (N - 1)) * 100 : 100).toFixed(2));
          prevReturn = currentReturn;
          prevRank = rank;
          prevPercentile = percentile;
          map.set(item.symbol, { rank, percentile });
        }
      });
      return map;
    }

    const rank1d = rankWindow(s => s.r1d);
    const rank5d = rankWindow(s => s.r5d);
    const rank10d = rankWindow(s => s.r10d);
    const rank21d = rankWindow(s => s.r21d);

    const finalStocks: MomentumStock[] = [];
    const countsByTier = { 'A+': 0, A: 0, B: 0, C: 0 };
    const countsByLeaderWindows = {
      '4_windows': 0,
      '3_windows': 0,
      '2_windows': 0,
      '1_window': 0,
      '0_windows': 0,
    };

    for (const s of rawStocks) {
      const m1 = rank1d.get(s.symbol)!;
      const m5 = rank5d.get(s.symbol)!;
      const m10 = rank10d.get(s.symbol)!;
      const m21 = rank21d.get(s.symbol)!;

      const scoreResult = MomentumLeadersService.calculateCompositeScore({
        p1d: m1.percentile,
        p5d: m5.percentile,
        p10d: m10.percentile,
        p21d: m21.percentile,
        vpaModifier: s.vpaFootprint.scoreModifier,
      });

      const stock: MomentumStock = {
        symbol: s.symbol,
        sector: s.sector,
        close: s.close,
        prevClose: s.prevClose,
        changePct: s.changePct,
        volume: s.volume,
        turnoverCr: s.turnoverCr,
        avgTurnoverCr20d: s.avgTurnoverCr20d,
        rvol20d: s.rvol20d,
        clv: s.clv,
        vpaFootprint: s.vpaFootprint,
        windows: {
          w1d: { returnPct: s.r1d, rank: m1.rank, percentile: m1.percentile, isLeader: m1.percentile >= 85.0 },
          w5d: { returnPct: s.r5d, rank: m5.rank, percentile: m5.percentile, isLeader: m5.percentile >= 85.0 },
          w10d: { returnPct: s.r10d, rank: m10.rank, percentile: m10.percentile, isLeader: m10.percentile >= 85.0 },
          w21d: { returnPct: s.r21d, rank: m21.rank, percentile: m21.percentile, isLeader: m21.percentile >= 85.0 },
        },
        leaderWindowCount: scoreResult.leaderWindowCount,
        baseScore: scoreResult.baseScore,
        consistencyBonus: scoreResult.consistencyBonus,
        dispersionPenalty: scoreResult.dispersionPenalty,
        vpaModifier: scoreResult.vpaModifier,
        compositeScore: scoreResult.compositeScore,
        tier: scoreResult.tier,
        isCircuitLocked: s.isCircuitLocked ?? false,
        circuitLimitPct: s.circuitLimitPct ?? null,
      };

      finalStocks.push(stock);
      countsByTier[stock.tier]++;

      if (stock.leaderWindowCount === 4) countsByLeaderWindows['4_windows']++;
      else if (stock.leaderWindowCount === 3) countsByLeaderWindows['3_windows']++;
      else if (stock.leaderWindowCount === 2) countsByLeaderWindows['2_windows']++;
      else if (stock.leaderWindowCount === 1) countsByLeaderWindows['1_window']++;
      else countsByLeaderWindows['0_windows']++;
    }

    // Sort descending by compositeScore, then by w21d returnPct, with deterministic symbol tie-breaker
    finalStocks.sort(
      (a, b) =>
        b.compositeScore - a.compositeScore ||
        b.windows.w21d.returnPct - a.windows.w21d.returnPct ||
        a.symbol.localeCompare(b.symbol)
    );

    // Top leaders: Tier A+ and A stocks (or top 35)
    const topLeaders = finalStocks.filter(s => s.compositeScore >= 80).slice(0, 35);

    return {
      date: latestDate,
      universe,
      totalScanned,
      qualifiedCount: finalStocks.length,
      countsByTier,
      countsByLeaderWindows,
      topLeaders,
      allStocks: finalStocks,
      computedAt: new Date().toISOString(),
      status: 'ready',
    };
  }
}

export interface RawStockAnalysis {
  symbol: string;
  sector: string;
  close: number;
  prevClose: number;
  changePct: number;
  volume: number;
  turnoverCr: number;
  avgTurnoverCr20d: number;
  rvol20d: number | null;
  clv: number | null;
  vpaFootprint: BreakoutVpaFootprint;
  r1d: number;
  r5d: number;
  r10d: number;
  r21d: number;
  isCircuitLocked: boolean;
  circuitLimitPct: number | null;
}