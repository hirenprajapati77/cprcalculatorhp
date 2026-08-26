import { PrismaClient, Prisma } from '@prisma/client';
import { cache } from '@/lib/redis';
import { computeRvol } from '@/services/vpa/vpa.math';
import { getSymbolSector } from './market-breadth.service';
import { QueueService } from '../queue.service';

const prisma = new PrismaClient();

export type PatternType = 'VCP' | 'CUP_AND_HANDLE' | 'DOUBLE_BOTTOM' | 'FLAT_BASE' | 'NONE';
export type BreakoutStatus = 'BREAKOUT' | 'NEAR_HIGH';

export interface OhlcvCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PatternDetails {
  type: PatternType;
  label: string;
  baseDepthPct: number;
  baseDays: number;
  confidence: number;
  description: string;
}

export interface ScoreBreakdown {
  proximityScore: number;  // 0 - 30
  volumeScore: number;     // 0 - 25
  patternScore: number;    // 0 - 25
  momentumScore: number;   // 0 - 20
  totalScore: number;      // 0 - 100
  qualityTier: 'A+' | 'A' | 'B' | 'C';
}

export interface PatternBreakoutStock {
  symbol: string;
  sector: string;
  close: number;
  prevClose: number;
  changePct: number;
  volume: number;
  rvol20d: number | null;
  historyDays: number;
  high52w: number;
  distanceToHighPct: number;
  status: BreakoutStatus;
  primaryPattern: PatternType;
  primaryPatternLabel: string;
  detectedPatterns: PatternDetails[];
  scoreBreakdown: ScoreBreakdown;
  patternDetails: PatternDetails | null;
}

export interface PatternBreakoutReport {
  date: string;
  tradingDaysAvailable: number;
  totalScanned: number;
  qualifiedCount: number;
  countsByStatus: {
    BREAKOUT: number;
    NEAR_HIGH: number;
  };
  countsByPattern: {
    VCP: number;
    CUP_AND_HANDLE: number;
    DOUBLE_BOTTOM: number;
    FLAT_BASE: number;
    NONE: number;
  };
  countsByStatus: Record<BreakoutStatus, number>;
  countsByPattern: Record<PatternType, number>;
  countsByTier: Record<PatternTier, number>;
  stocks: PatternBreakoutStock[];
  computedAt: string;
}

export interface PatternBreakoutJobStatus {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  error?: string;
  startedAt?: number;
  updatedAt: number;
}

let cachedReport: PatternBreakoutReport | null = null;
let lastComputedTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export class PatternBreakoutService {
  /**
   * Fetch current background scan job status from Redis / memory cache.
   */
  static async getJobStatus(): Promise<PatternBreakoutJobStatus> {
    try {
      const raw = await cache.get('market_tools:pattern_breakout:status');
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore cache lookup error
    }
    return { status: 'idle', updatedAt: Date.now() };
  }

  /**
   * Non-blocking trigger for manual refresh. Returns HTTP 202 status payload immediately (<10ms).
   * Uses a dedicated Redis atomic SETNX lock key (market_tools:pattern_breakout:lock) to ensure 
   * strict single-execution concurrency control without conflating completed/failed status entries.
   */
  static async triggerBackgroundRefresh(): Promise<{ status: 'processing'; message: string }> {
    const lockKey = 'market_tools:pattern_breakout:lock';
    const statusKey = 'market_tools:pattern_breakout:status';
    const now = Date.now();

    // 1. Atomic SETNX Mutex Lock: Returns true only if lock key did not exist
    const acquired = await cache.setNX(lockKey, 'locked', 120);
    if (!acquired) {
      return { status: 'processing', message: 'Scan already in progress' };
    }

    // 2. Record status board entry
    const processingStatus: PatternBreakoutJobStatus = {
      status: 'processing',
      startedAt: now,
      updatedAt: now,
    };
    await cache.set(statusKey, JSON.stringify(processingStatus), 120);

    // 3. Single Execution Dispatcher: Enqueue to BullMQ worker if enabled, else single in-process fallback
    let enqueuedToQueue = false;
    if (QueueService.isEnabled && QueueService.marketQueue) {
      try {
        await QueueService.marketQueue.add(
          'pattern-breakout-refresh',
          { timestamp: now },
          { jobId: `pattern-breakout-${now}`, removeOnComplete: true }
        );
        enqueuedToQueue = true;
      } catch (err) {
        console.error('[PatternBreakoutService] BullMQ enqueue failed, using in-process execution:', err);
      }
    }

    if (!enqueuedToQueue) {
      setImmediate(() => {
        PatternBreakoutService.runBackgroundRefreshJob().catch((err) => {
          console.error('[PatternBreakoutService] In-process fallback scan job failed:', err);
        });
      });
    }

    return { status: 'processing', message: 'Pattern breakout scan enqueued' };
  }

  /**
   * Run background refresh scan and save output to Redis cache upon completion.
   * Releases dedicated SETNX lock key upon completion or failure.
   */
  static async runBackgroundRefreshJob(): Promise<PatternBreakoutReport> {
    const lockKey = 'market_tools:pattern_breakout:lock';
    const statusKey = 'market_tools:pattern_breakout:status';

    try {
      const report = await PatternBreakoutService.computePatternBreakoutReport();
      cachedReport = report;
      lastComputedTime = Date.now();
      await cache.set('market_tools:pattern_breakout:report', JSON.stringify(report), 3600);
      const doneStatus: PatternBreakoutJobStatus = {
        status: 'completed',
        updatedAt: Date.now(),
      };
      await cache.set(statusKey, JSON.stringify(doneStatus), 300);
      await cache.del(lockKey);
      return report;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const failStatus: PatternBreakoutJobStatus = {
        status: 'failed',
        error: errorMsg,
        updatedAt: Date.now(),
      };
      await cache.set(statusKey, JSON.stringify(failStatus), 300);
      await cache.del(lockKey);
      throw err;
    }
  }

  /**
   * Main entrypoint to get precomputed / cached pattern breakout report.
   * Enforces 250-day history depth guard and zero live heavy computation on unauthenticated requests.
   */
  static async getPatternBreakoutReport(forceRefresh = false): Promise<PatternBreakoutReport> {
    const now = Date.now();

    if (!forceRefresh) {
      try {
        const redisCached = await cache.get('market_tools:pattern_breakout:report');
        if (redisCached) {
          const parsed = JSON.parse(redisCached) as PatternBreakoutReport;
          cachedReport = parsed;
          lastComputedTime = now;
          return parsed;
        }
      } catch {
        // Ignore cache lookup errors
      }

      // Memory fallback if Redis is temporarily unreachable
      if (cachedReport && now - lastComputedTime < CACHE_TTL_MS) {
        return cachedReport;
      }

      // If cache is missing and forceRefresh=false, do NOT trigger heavy live compute on HTTP thread.
      // Return empty baseline report until background precompute job runs.
      return {
        date: new Date().toISOString().split('T')[0],
        tradingDaysAvailable: 0,
        totalScanned: 0,
        qualifiedCount: 0,
        countsByStatus: { BREAKOUT: 0, NEAR_HIGH: 0 },
        countsByPattern: { VCP: 0, CUP_AND_HANDLE: 0, DOUBLE_BOTTOM: 0, FLAT_BASE: 0, NONE: 0 },
        countsByTier: { 'A+': 0, A: 0, B: 0, C: 0 },
        stocks: [],
        computedAt: new Date().toISOString(),
      };
    }

    return this.runBackgroundRefreshJob();
  }

  /**
   * Compute pattern breakout scan across DailyOhlcv history with full O'Neil & Minervini heuristics.
   */
  static async computePatternBreakoutReport(): Promise<PatternBreakoutReport> {
    // 1. Fetch available trading dates sorted descending
    const dateRows = await prisma.$queryRaw<Array<{ date: string }>>`
      SELECT DISTINCT date FROM "DailyOhlcv" WHERE series = 'EQ' ORDER BY date DESC LIMIT 300
    `;

    if (dateRows.length === 0) {
      throw new Error('No data available in DailyOhlcv table');
    }

    const latestDate = dateRows[0]!.date;
    const tradingDaysAvailable = dateRows.length;

    // 2. Fetch candidates with 52W High using exact prior 250-day window (excluding current day)
    const rawCandidates = await prisma.$queryRaw<
      Array<{
        symbol: string;
        close: number;
        prevClose: number;
        volume: bigint | number;
        historyDays: bigint | number;
        high52w: number | null;
        avgVol20: number | null;
      }>
    >`
      WITH RankedHistory AS (
        SELECT 
          symbol,
          series,
          date,
          close,
          "prevClose",
          volume,
          COUNT(*) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as "historyDays",
          MAX(high) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 249 PRECEDING AND 1 PRECEDING) as "high52w",
          AVG(volume) OVER (PARTITION BY symbol ORDER BY date ASC ROWS BETWEEN 20 PRECEDING AND 1 PRECEDING) as "avgVol20",
          ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY date DESC) as rn
        FROM "DailyOhlcv"
        WHERE series = 'EQ'
      )
      SELECT 
        symbol,
        close,
        "prevClose",
        volume,
        "historyDays",
        "high52w",
        "avgVol20"
      FROM RankedHistory
      WHERE date = ${latestDate} AND rn = 1
    `;

    // Filter to stocks meeting history depth guard (>= 250 days) and within 5% of 52W high or breaking out
    const qualifyingList: Array<{
      symbol: string;
      close: number;
      prevClose: number;
      volume: number;
      historyDays: number;
      high52w: number;
      avgVol20: number;
      distanceToHighPct: number;
      status: BreakoutStatus;
    }> = [];

    let totalScanned = 0;

    for (const row of rawCandidates) {
      totalScanned++;
      const historyDays = Number(row.historyDays);
      const close = Number(row.close);
      const prevClose = Number(row.prevClose);
      const volume = Number(row.volume);
      const avgVol20 = Number(row.avgVol20 || 0);

      // History depth guard: Must have at least 250 trading days
      if (historyDays < 250 || row.high52w === null || row.high52w <= 0) {
        continue;
      }

      const high52w = Number(row.high52w);
      const distanceToHighPct = ((close - high52w) / high52w) * 100;

      let status: BreakoutStatus | null = null;
      if (close >= high52w) {
        status = 'BREAKOUT';
      } else if (distanceToHighPct >= -5.0) {
        status = 'NEAR_HIGH';
      }

      if (status) {
        qualifyingList.push({
          symbol: row.symbol,
          close,
          prevClose,
          volume,
          historyDays,
          high52w,
          avgVol20,
          distanceToHighPct: Number(distanceToHighPct.toFixed(2)),
          status,
        });
      }
    }

    if (qualifyingList.length === 0) {
      const emptyReport: PatternBreakoutReport = {
        date: latestDate,
        tradingDaysAvailable,
        totalScanned,
        qualifiedCount: 0,
        countsByStatus: { BREAKOUT: 0, NEAR_HIGH: 0 },
        countsByPattern: { VCP: 0, CUP_AND_HANDLE: 0, DOUBLE_BOTTOM: 0, FLAT_BASE: 0, NONE: 0 },
        countsByTier: { 'A+': 0, A: 0, B: 0, C: 0 },
        stocks: [],
        computedAt: new Date().toISOString(),
      };
      await this.saveCache(emptyReport);
      return emptyReport;
    }

    // 3. Query trailing 90 candles for qualifying symbols to perform pattern analysis
    const qualifyingSymbols = qualifyingList.map(s => s.symbol);
    const candleRows = await prisma.$queryRaw<
      Array<{
        symbol: string;
        date: string;
        open: number;
        high: number;
        low: number;
        close: number;
        volume: bigint | number;
      }>
    >`
      SELECT symbol, date, open, high, low, close, volume
      FROM "DailyOhlcv"
      WHERE series = 'EQ' AND symbol IN (${Prisma.join(qualifyingSymbols)})
      ORDER BY symbol ASC, date ASC
    `;

    // Group candles by symbol
    const candleMap = new Map<string, OhlcvCandle[]>();
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
        volume: Number(r.volume),
      });
    }

    // 4. Run pattern heuristics and composite scoring on each stock
    const stocks: PatternBreakoutStock[] = [];
    const countsByStatus = { BREAKOUT: 0, NEAR_HIGH: 0 };
    const countsByPattern = { VCP: 0, CUP_AND_HANDLE: 0, DOUBLE_BOTTOM: 0, FLAT_BASE: 0, NONE: 0 };
    const countsByTier = { 'A+': 0, A: 0, B: 0, C: 0 };

    for (const q of qualifyingList) {
      const candles = candleMap.get(q.symbol) || [];
      const sector = getSymbolSector(q.symbol);
      const changePct = q.prevClose > 0 ? Number((((q.close - q.prevClose) / q.prevClose) * 100).toFixed(2)) : 0;
      
      const rvol20dRaw = q.avgVol20 > 0 ? computeRvol(q.volume, q.avgVol20) : null;
      const rvol20d = rvol20dRaw !== null ? Number(rvol20dRaw.toFixed(2)) : null;

      // Detect all matching patterns
      const detectedPatterns = this.detectAllPatterns(candles, q.high52w);
      const primaryPattern = this.selectPrimaryPattern(detectedPatterns);
      const primaryPatternLabel = this.getPatternLabel(primaryPattern);
      const primaryPatternDetails = detectedPatterns.find(p => p.type === primaryPattern) || null;

      // Compute Total Score
      const scoreBreakdown = this.computeScore({
        status: q.status,
        distanceToHighPct: q.distanceToHighPct,
        rvol20d,
        primaryPattern,
        patternDetails: primaryPatternDetails,
        candles,
      });

      // Update counters
      countsByStatus[q.status]++;
      countsByPattern[primaryPattern]++;
      countsByTier[scoreBreakdown.qualityTier]++;

      stocks.push({
        symbol: q.symbol,
        sector,
        close: q.close,
        prevClose: q.prevClose,
        changePct,
        volume: q.volume,
        rvol20d,
        historyDays: q.historyDays,
        high52w: q.high52w,
        distanceToHighPct: q.distanceToHighPct,
        status: q.status,
        primaryPattern,
        primaryPatternLabel,
        detectedPatterns,
        scoreBreakdown,
        patternDetails: primaryPatternDetails,
      });
    }

    // Sort stocks descending by Total Score, then by distance to 52W high
    stocks.sort((a, b) => b.scoreBreakdown.totalScore - a.scoreBreakdown.totalScore || b.distanceToHighPct - a.distanceToHighPct);

    const report: PatternBreakoutReport = {
      date: latestDate,
      tradingDaysAvailable,
      totalScanned,
      qualifiedCount: stocks.length,
      countsByStatus,
      countsByPattern,
      countsByTier,
      stocks,
      computedAt: new Date().toISOString(),
    };

    await this.saveCache(report);
    return report;
  }

  /**
   * Run all 4 pattern detection heuristics over candle history.
   */
  static detectAllPatterns(candles: OhlcvCandle[], high52w: number): PatternDetails[] {
    const results: PatternDetails[] = [];
    if (candles.length < 30) return results;

    const vcp = this.detectVcp(candles, high52w);
    if (vcp) results.push(vcp);

    const cupAndHandle = this.detectCupAndHandle(candles, high52w);
    if (cupAndHandle) results.push(cupAndHandle);

    const doubleBottom = this.detectDoubleBottom(candles, high52w);
    if (doubleBottom) results.push(doubleBottom);

    const flatBase = this.detectFlatBase(candles, high52w);
    if (flatBase) results.push(flatBase);

    return results;
  }

  /**
   * Deterministic tie-breaker selection for primary pattern display.
   */
  static selectPrimaryPattern(detected: PatternDetails[]): PatternType {
    if (detected.length === 0) return 'NONE';
    const hierarchy: PatternType[] = ['VCP', 'CUP_AND_HANDLE', 'DOUBLE_BOTTOM', 'FLAT_BASE'];
    for (const type of hierarchy) {
      if (detected.some(d => d.type === type)) {
        return type;
      }
    }
    return 'NONE';
  }

  static getPatternLabel(type: PatternType): string {
    switch (type) {
      case 'VCP': return 'Volatility Contraction (VCP)';
      case 'CUP_AND_HANDLE': return 'Cup & Handle';
      case 'DOUBLE_BOTTOM': return 'Double Bottom';
      case 'FLAT_BASE': return 'Flat Base';
      default: return 'Raw 52W Breakout';
    }
  }

  /**
   * Cup & Handle Detection Algorithm (O'Neil Standard)
   */
  static detectCupAndHandle(candles: OhlcvCandle[], _high52w: number): PatternDetails | null {
    if (candles.length < 40) return null;
    const window = candles.slice(-70);
    const n = window.length;

    // Left lip peak P1 occurs between 25 and 65 candles ago
    let leftPeakIdx = -1;
    let leftPeakVal = -1;
    for (let i = 0; i < n - 20; i++) {
      if (window[i].high > leftPeakVal) {
        leftPeakVal = window[i].high;
        leftPeakIdx = i;
      }
    }
    if (leftPeakIdx === -1 || leftPeakIdx > n - 25) return null;

    // Cup bottom D1 occurs after P1 but before the handle (between leftPeakIdx and n-10)
    let cupBottomVal = Infinity;
    let cupBottomIdx = -1;
    for (let i = leftPeakIdx + 5; i < n - 10; i++) {
      if (window[i].low < cupBottomVal) {
        cupBottomVal = window[i].low;
        cupBottomIdx = i;
      }
    }
    if (cupBottomIdx === -1) return null;

    // Cup depth check: 12% to 35%
    const cupDepthPct = ((leftPeakVal - cupBottomVal) / leftPeakVal) * 100;
    if (cupDepthPct < 12 || cupDepthPct > 35) return null;

    // Right lip P2 recovery peak (between cupBottom and last 5 candles)
    let rightPeakVal = -1;
    let rightPeakIdx = -1;
    for (let i = cupBottomIdx + 5; i < n - 3; i++) {
      if (window[i].high > rightPeakVal) {
        rightPeakVal = window[i].high;
        rightPeakIdx = i;
      }
    }
    if (rightPeakIdx === -1) return null;

    // Lip symmetry check: Right lip within 6% of left lip
    const lipDiffPct = (Math.abs(rightPeakVal - leftPeakVal) / leftPeakVal) * 100;
    if (lipDiffPct > 6.0) return null;

    // Handle pullback check: from rightPeakIdx to end
    let handleLowVal = Infinity;
    let handleCount = 0;
    for (let i = rightPeakIdx; i < n; i++) {
      if (window[i].low < handleLowVal) handleLowVal = window[i].low;
      handleCount++;
    }
    if (handleCount < 3 || handleCount > 15) return null;

    const handlePullbackPct = ((rightPeakVal - handleLowVal) / rightPeakVal) * 100;
    if (handlePullbackPct > 12.0) return null;

    // Handle must stay in upper half of cup
    const cupMidpoint = cupBottomVal + (leftPeakVal - cupBottomVal) * 0.5;
    if (handleLowVal < cupMidpoint) return null;

    const baseDays = n - leftPeakIdx;
    return {
      type: 'CUP_AND_HANDLE',
      label: 'Cup & Handle',
      baseDepthPct: Number(cupDepthPct.toFixed(1)),
      baseDays,
      confidence: Number((85 - lipDiffPct * 2 - handlePullbackPct).toFixed(0)),
      description: `U-shaped cup (${cupDepthPct.toFixed(1)}% depth, ${baseDays}d) with tight ${handlePullbackPct.toFixed(1)}% handle drift`,
    };
  }

  /**
   * Flat Base Detection Algorithm (Minervini / O'Neil)
   */
  static detectFlatBase(candles: OhlcvCandle[], high52w: number): PatternDetails | null {
    if (candles.length < 25) return null;
    // Inspect trailing 20 to 45 candles
    const baseWindow = candles.slice(-30);
    const n = baseWindow.length;
    if (n < 20) return null;

    let baseHigh = -Infinity;
    let baseLow = Infinity;
    for (const c of baseWindow) {
      if (c.high > baseHigh) baseHigh = c.high;
      if (c.low < baseLow) baseLow = c.low;
    }

    if (baseHigh <= 0 || baseLow <= 0) return null;

    // Range tightness: (High - Low) / High <= 15%
    const channelDepthPct = ((baseHigh - baseLow) / baseHigh) * 100;
    if (channelDepthPct > 15.0) return null;

    // Base elevation: Must be within 15% of 52W High
    if (baseHigh < high52w * 0.85) return null;

    return {
      type: 'FLAT_BASE',
      label: 'Flat Base',
      baseDepthPct: Number(channelDepthPct.toFixed(1)),
      baseDays: n,
      confidence: Number(Math.max(60, 95 - channelDepthPct * 2).toFixed(0)),
      description: `Tight ${channelDepthPct.toFixed(1)}% horizontal consolidation range over ${n} trading days`,
    };
  }

  /**
   * Double Bottom Detection Algorithm (W-Shape)
   */
  static detectDoubleBottom(candles: OhlcvCandle[], _high52w: number): PatternDetails | null {
    if (candles.length < 35) return null;
    const window = candles.slice(-55);
    const n = window.length;

    // First trough L1 occurs in first half of window
    let l1Val = Infinity;
    let l1Idx = -1;
    for (let i = 2; i < Math.floor(n * 0.5); i++) {
      if (window[i].low < l1Val) {
        l1Val = window[i].low;
        l1Idx = i;
      }
    }
    if (l1Idx === -1) return null;

    // Intermediate peak M_peak occurs between L1 and second half
    let peakVal = -Infinity;
    let peakIdx = -1;
    for (let i = l1Idx + 4; i < n - 8; i++) {
      if (window[i].high > peakVal) {
        peakVal = window[i].high;
        peakIdx = i;
      }
    }
    if (peakIdx === -1) return null;

    // Peak must rise at least 7% above L1
    const peakRisePct = ((peakVal - l1Val) / l1Val) * 100;
    if (peakRisePct < 7.0 || peakRisePct > 25.0) return null;

    // Second trough L2 occurs after intermediate peak
    let l2Val = Infinity;
    let l2Idx = -1;
    for (let i = peakIdx + 4; i < n - 2; i++) {
      if (window[i].low < l2Val) {
        l2Val = window[i].low;
        l2Idx = i;
      }
    }
    if (l2Idx === -1) return null;

    // Trough parity: L2 within +/- 4% of L1 (or undercut shakeout)
    const troughDiffPct = ((l2Val - l1Val) / l1Val) * 100;
    if (Math.abs(troughDiffPct) > 4.5) return null;

    // Current price should be breaking out above or near M_peak
    const currentClose = window[n - 1].close;
    const distanceToPeakPct = ((currentClose - peakVal) / peakVal) * 100;
    if (distanceToPeakPct < -5.0) return null;

    const baseDays = n - l1Idx;
    return {
      type: 'DOUBLE_BOTTOM',
      label: 'Double Bottom',
      baseDepthPct: Number(peakRisePct.toFixed(1)),
      baseDays,
      confidence: Number(Math.max(65, 90 - Math.abs(troughDiffPct) * 3).toFixed(0)),
      description: `W-trough base (${baseDays}d) with ${Math.abs(troughDiffPct).toFixed(1)}% bottom parity and pivot break`,
    };
  }

  /**
   * Volatility Contraction Pattern (VCP - Minervini)
   */
  static detectVcp(candles: OhlcvCandle[], _high52w: number): PatternDetails | null {
    if (candles.length < 50) return null;
    const window = candles.slice(-75);
    const n = window.length;

    // Wave 1: First 30 candles
    const w1 = window.slice(0, Math.floor(n * 0.55));
    let w1High = -Infinity, w1Low = Infinity;
    for (const c of w1) {
      if (c.high > w1High) w1High = c.high;
      if (c.low < w1Low) w1Low = c.low;
    }
    const t1Depth = ((w1High - w1Low) / w1High) * 100;
    if (t1Depth < 12.0 || t1Depth > 35.0) return null;

    // Wave 2: Next 25 candles (must contract to smaller depth than Wave 1)
    const w2 = window.slice(Math.floor(n * 0.55));
    let w2High = -Infinity, w2Low = Infinity;
    for (const c of w2) {
      if (c.high > w2High) w2High = c.high;
      if (c.low < w2Low) w2Low = c.low;
    }
    const t2Depth = ((w2High - w2Low) / w2High) * 100;
    if (t2Depth >= t1Depth || t2Depth > 18.0 || t2Depth < 4.0) return null;

    // Contraction ratio
    const contractionRatio = t2Depth / t1Depth;
    if (contractionRatio > 0.75) return null; // Must contract by at least 25%

    return {
      type: 'VCP',
      label: 'Volatility Contraction (VCP)',
      baseDepthPct: Number(t2Depth.toFixed(1)),
      baseDays: n,
      confidence: Number(Math.min(95, Math.max(70, 100 - t2Depth * 2)).toFixed(0)),
      description: `Sequential 2-stage contraction (${t1Depth.toFixed(1)}% → ${t2Depth.toFixed(1)}%) with tightening range`,
    };
  }

  /**
   * Compute 0 - 100 Composite Total Score
   */
  static computeScore(params: {
    status: BreakoutStatus;
    distanceToHighPct: number;
    rvol20d: number | null;
    primaryPattern: PatternType;
    patternDetails: PatternDetails | null;
    candles: OhlcvCandle[];
  }): ScoreBreakdown {
    // 1. Proximity Score (Max 30)
    let proximityScore = 0;
    if (params.status === 'BREAKOUT') {
      proximityScore = 30;
    } else if (params.status === 'NEAR_HIGH') {
      // Linear scale from 15 to 29 between -5.0% and 0.0%
      proximityScore = Math.min(29, Math.max(15, Math.round(15 + (5.0 + params.distanceToHighPct) * 2.8)));
    }

    // 2. Volume Score (Max 25)
    let volumeScore = 0;
    const rvol = params.rvol20d ?? 1.0;
    if (rvol >= 2.5) {
      volumeScore = 25;
    } else if (rvol >= 1.75) {
      volumeScore = 20;
    } else if (rvol >= 1.25) {
      volumeScore = 14;
    } else if (rvol >= 1.0) {
      volumeScore = 8;
    } else {
      volumeScore = 0;
    }

    // 3. Pattern Quality Score (Max 25)
    let patternScore = 0;
    if (params.primaryPattern === 'VCP' || params.primaryPattern === 'CUP_AND_HANDLE') {
      patternScore = 20;
      if (params.patternDetails && params.patternDetails.baseDepthPct <= 12.0) {
        patternScore += 5; // Tightness bonus
      }
    } else if (params.primaryPattern === 'DOUBLE_BOTTOM' || params.primaryPattern === 'FLAT_BASE') {
      patternScore = 18;
      if (params.patternDetails && params.patternDetails.baseDepthPct <= 8.0) {
        patternScore += 5; // Tightness bonus
      }
    } else {
      patternScore = 5; // Raw 52W high baseline
    }

    // 4. Momentum & Moving Average Score (Max 20)
    let momentumScore = 0;
    if (params.candles.length >= 20) {
      const c = params.candles;
      const currentClose = c[c.length - 1].close;
      const close20dAgo = c[Math.max(0, c.length - 20)].close;
      const ret20d = close20dAgo > 0 ? ((currentClose - close20dAgo) / close20dAgo) * 100 : 0;

      if (ret20d >= 10.0) momentumScore += 10;
      else if (ret20d >= 5.0) momentumScore += 7;
      else if (ret20d > 0.0) momentumScore += 4;

      // SMA 20 vs SMA 50 alignment
      if (c.length >= 50) {
        const sma20 = c.slice(-20).reduce((s, x) => s + x.close, 0) / 20;
        const sma50 = c.slice(-50).reduce((s, x) => s + x.close, 0) / 50;
        if (currentClose > sma20 && sma20 > sma50) {
          momentumScore += 10;
        } else if (currentClose > sma20) {
          momentumScore += 5;
        }
      } else {
        momentumScore += 5;
      }
    }

    const totalScore = Math.min(100, Math.max(0, proximityScore + volumeScore + patternScore + momentumScore));

    let qualityTier: 'A+' | 'A' | 'B' | 'C' = 'C';
    if (totalScore >= 85) qualityTier = 'A+';
    else if (totalScore >= 70) qualityTier = 'A';
    else if (totalScore >= 50) qualityTier = 'B';

    return {
      proximityScore,
      volumeScore,
      patternScore,
      momentumScore,
      totalScore,
      qualityTier,
    };
  }

  private static async saveCache(report: PatternBreakoutReport): Promise<void> {
    cachedReport = report;
    lastComputedTime = Date.now();
    try {
      await cache.set('market_tools:pattern_breakout:report', JSON.stringify(report), 3600);
    } catch {
      // Memory fallback active
    }
  }
}
