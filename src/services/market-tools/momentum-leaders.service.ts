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
}

export interface MomentumLeadersReport {
  date: string;
  universe: 'NSE_FNO';
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

let cachedReport: MomentumLeadersReport | null = null;
let lastComputedTime = 0;
let inFlightCompute: Promise<MomentumLeadersReport> | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REDIS_CACHE_KEY = 'market_tools:momentum_leaders:report';
const REDIS_TTL_SEC = 24 * 3600; // 24 hours

export class MomentumLeadersService {
  /**
   * Minimum 20-day average daily turnover required for a stock to qualify (in ₹ Cr).
   * Stocks below this floor are excluded before percentile ranking.
   */
  public static readonly MIN_LIQUIDITY_TURNOVER_CR = 10.0;

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
   * Compounded return across k trading sessions using exchange-adjusted prevClose.
   * Immunizes multi-window returns against stock splits, bonuses, and capital restructuring.
   */
  static computeCompoundedReturn(candles: OhlcvCandleWithPrevClose[], k: number): number {
    if (candles.length < k || k <= 0) return 0;
    const window = candles.slice(-k);
    let compoundRatio = 1.0;

    for (const c of window) {
      if (c.prevClose > 0) {
        const dailyReturn = (c.close - c.prevClose) / c.prevClose;
        compoundRatio *= (1.0 + dailyReturn);
      }
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
   * Retrieves the Momentum Leaders report with Redis and in-memory caching.
   */
  static async getMomentumLeadersReport(forceRefresh = false): Promise<MomentumLeadersReport> {
    const now = Date.now();
    if (!forceRefresh && cachedReport && now - lastComputedTime < CACHE_TTL_MS) {
      return cachedReport;
    }

    if (!forceRefresh) {
      try {
        const redisCached = await cache.get(REDIS_CACHE_KEY);
        if (redisCached) {
          const parsed = JSON.parse(redisCached) as MomentumLeadersReport;
          cachedReport = parsed;
          lastComputedTime = now;
          return parsed;
        }
      } catch {
        // Fall back to compute on cache miss/error
      }
    }

    if (inFlightCompute) {
      return await inFlightCompute;
    }

    inFlightCompute = MomentumLeadersService.computeMomentumLeadersReport()
      .then(async (report) => {
        cachedReport = report;
        lastComputedTime = Date.now();
        try {
          await cache.set(REDIS_CACHE_KEY, JSON.stringify(report), REDIS_TTL_SEC);
        } catch {
          // Non-critical cache write error
        }
        return report;
      })
      .finally(() => {
        inFlightCompute = null;
      });

    return await inFlightCompute;
  }

  /**
   * Computes the Multi-Window Momentum Leaders across the F&O universe.
   */
  static async computeMomentumLeadersReport(): Promise<MomentumLeadersReport> {
    // 1. Fetch available trading dates sorted descending
    const dateRows = await prisma.$queryRaw<Array<{ date: string }>>`
      SELECT DISTINCT date FROM "DailyOhlcv" 
      WHERE series = 'EQ' 
      ORDER BY date DESC 
      LIMIT 60
    `;

    if (dateRows.length === 0) {
      throw new Error('No data available in DailyOhlcv table');
    }

    const latestDate = dateRows[0]!.date;
    const oldestDate = dateRows[Math.min(dateRows.length - 1, 45)]!.date;

    // 2. Filter F&O symbols excluding ETF/funds
    const fnoSymbolList = Array.from(FNO_SYMBOLS).filter(sym => !isLikelyEtfOrFund(sym));
    const totalScanned = fnoSymbolList.length;

    // 3. Fetch trailing candles for F&O universe
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
        AND symbol = ANY(${fnoSymbolList}::text[])
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

    // 4. Calculate returns and VPA for each eligible stock
    interface RawStockAnalysis {
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
    }

    const rawStocks: RawStockAnalysis[] = [];

    for (const symbol of fnoSymbolList) {
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
      // Eliminates structurally illiquid names from qualifying as window momentum leaders
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

      rawStocks.push({
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
      });
    }

    const N = rawStocks.length;
    if (N === 0) {
      return {
        date: latestDate,
        universe: 'NSE_FNO',
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

    // 5. Compute percentile ranks per window
    function rankWindow(extractReturn: (s: RawStockAnalysis) => number): Map<string, { rank: number; percentile: number }> {
      const sorted = [...rawStocks].sort((a, b) => extractReturn(b) - extractReturn(a));
      const map = new Map<string, { rank: number; percentile: number }>();
      sorted.forEach((item, idx) => {
        const rank = idx + 1;
        const percentile = Number((N > 1 ? ((N - rank) / (N - 1)) * 100 : 100).toFixed(2));
        map.set(item.symbol, { rank, percentile });
      });
      return map;
    }

    const rank1d = rankWindow(s => s.r1d);
    const rank5d = rankWindow(s => s.r5d);
    const rank10d = rankWindow(s => s.r10d);
    const rank21d = rankWindow(s => s.r21d);

    // 6. Combine into final scored MomentumStock objects
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
      };

      finalStocks.push(stock);
      countsByTier[stock.tier]++;

      if (stock.leaderWindowCount === 4) countsByLeaderWindows['4_windows']++;
      else if (stock.leaderWindowCount === 3) countsByLeaderWindows['3_windows']++;
      else if (stock.leaderWindowCount === 2) countsByLeaderWindows['2_windows']++;
      else if (stock.leaderWindowCount === 1) countsByLeaderWindows['1_window']++;
      else countsByLeaderWindows['0_windows']++;
    }

    // Sort descending by compositeScore, then by w21d returnPct
    finalStocks.sort((a, b) => b.compositeScore - a.compositeScore || b.windows.w21d.returnPct - a.windows.w21d.returnPct);

    // Top leaders: Tier A+ and A stocks (or top 35)
    const topLeaders = finalStocks.filter(s => s.compositeScore >= 80).slice(0, 35);

    return {
      date: latestDate,
      universe: 'NSE_FNO',
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