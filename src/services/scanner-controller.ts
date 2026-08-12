import { env } from '@/config/env';
import { prisma } from '@/lib/db';
import { CacheService } from './cache.service';
import { MarketService } from './market.service';
import { ScannerService, ScannerSignalResult } from './scanner.service';
import { RankingService } from './ranking.service';
import { SectorRegimeService } from './sector-regime.service';
import { getISTDateString } from '@/lib/market-hours';
import { EventCalendarService } from './overnight/event.service';

// Removed module-level PERSISTENT_FAILURES Map, using CacheService instead

// Per-universe mutex to deduplicate concurrent scan executions within the same Node.js process.
// Keyed by "universe:market" to prevent cross-contamination between e.g. NIFTY_FNO and WATCHLIST.
// NOTE: This is process-local. In production, this relies on PM2 running in fork_mode.
// If clustering or multi-worker deployment is introduced, this must be replaced with
// a distributed lock (e.g. Redis SET mutex NX EX 120).
const inFlightScanPromises = new Map<string, Promise<Array<ScannerSignalResult & { score: number }>>>();

/** True while a full scan is running in this process for ANY universe (cron, refresh, or manual). */
export function isScanInProgress(): boolean {
  return inFlightScanPromises.size > 0;
}

export class ScannerController {
  /**
   * Runs a complete stock scanner execution for a specific universe and market.
   */
  static async runFullScan(
    universeName: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST' = 'NSE_FNO',
    market: 'NSE' | 'BSE' = 'NSE'
  ): Promise<Array<ScannerSignalResult & { score: number }>> {
    const scanKey = `${universeName}:${market}`;
    const existing = inFlightScanPromises.get(scanKey);
    if (existing) {
      console.log(`[SCAN] Scan already in progress for ${scanKey} — reusing in-flight scan promise.`);
      return existing;
    }

    const promise = (async () => {
      try {
        return await ScannerController.executeScan(universeName, market);
      } finally {
        inFlightScanPromises.delete(scanKey);
      }
    })();

    inFlightScanPromises.set(scanKey, promise);
    return promise;
  }

  private static async executeScan(
    universeName: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST',
    market: 'NSE' | 'BSE'
  ): Promise<Array<ScannerSignalResult & { score: number }>> {
    const startTime = Date.now();
    console.log(`Starting CPR Scan V2 for universe=${universeName}, market=${market}...`);
    
    let stocks: { symbol: string }[] = [];
    if (universeName === 'WATCHLIST') {
      const watchlistItems = await prisma.watchlist.findMany();
      stocks = watchlistItems.map((item: { symbol: string }) => ({ symbol: item.symbol }));
    } else {
      stocks = MarketService.getUniverse(universeName);
    }

    const execMode = (env.EXECUTION_MODE || 'auto').toLowerCase();
    const queueThreshold = parseInt(env.SCAN_QUEUE_THRESHOLD?.toString() || '75', 10);
    // Only attempt queue when ENABLE_QUEUE=true and mode is explicitly queue/auto.
    // Do not treat trading EXECUTION_MODE=SHADOW/LIVE as queue mode.
    const shouldQueue =
      env.ENABLE_QUEUE === 'true' &&
      (execMode === 'queue' || (execMode === 'auto' && stocks.length >= queueThreshold));

    if (shouldQueue) {
      // No BullMQ worker is wired for full-scan — never enqueue (avoids Redis noise
      // and duplicate jobs if a worker is added later without updating this path).
      console.warn(
        `[ScannerController] Queue mode requested (threshold ${queueThreshold}, ` +
          `${stocks.length} symbols) but no worker exists; executing scan inline.`
      );
    }

    const today = getISTDateString();
    const rawResults: ScannerSignalResult[] = [];

    // Bulk fetch event risks for all symbols to avoid N+1 queries
    const symbols = stocks.map(s => s.symbol.trim());
    const eventRisks = await EventCalendarService.getBulkEventRisk(symbols, today);

    // One/few Fyers quotes HTTP for the whole universe (≤50/req) so per-symbol
    // getStockData skips N quote round-trips (history/15m still per-symbol).
    await MarketService.prefetchFyersQuotes(symbols, market);

    // Parallel fetch with batching — shrink when Fyers is rate-limited (Oracle 1GB VM).
    const batchSize = MarketService.isFyersTemporarilyUnavailable() ? 2 : 5;
    if (batchSize < 5) {
      console.log(`[SCAN] Fyers cooldown active — batch size ${batchSize}`);
    }
    for (let i = 0; i < stocks.length; i += batchSize) {
      const batch = stocks.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (stockMeta) => {
        // Skip blacklisted symbols (3+ consecutive fetch failures)
        const failureCacheKey = `failure_count_${stockMeta.symbol}`;
        const prevFailures = await CacheService.get<number>(failureCacheKey) || 0;
        if (prevFailures >= 3) return null;

        try {
          const data = await MarketService.getStockData(stockMeta.symbol, market);
          if (data) {
            // Reset failure count on success
            await CacheService.delete(`failure_count_${stockMeta.symbol}`);
            const risk = eventRisks[stockMeta.symbol.trim()] || { severity: 0, reason: null, source: 'LOCAL_DB', confidence: 'UNKNOWN' };
            return await ScannerService.scanStock(data, undefined, risk);
          }
        } catch (err) {
          const sym = stockMeta.symbol;
          const failureCacheKey = `failure_count_${sym}`;
          const failCount = (await CacheService.get<number>(failureCacheKey) || 0) + 1;
          // Blacklist temporary fetch issues for 1 hour instead of a full day to allow recovery
          await CacheService.set(failureCacheKey, failCount, 3600);
          const errMsg = err instanceof Error ? err.message : String(err);
          console.error(`[SKIP] ${sym} - fetch failed: ${errMsg}`);
          if (failCount >= 3) {
            console.warn(`[BLACKLIST] ${sym} - 3 consecutive failures, skipping future scans`);
          }
        }
        return null;
      });

      const batchPromisesResults = await Promise.all(batchPromises);
      batchPromisesResults.forEach((r) => {
        if (r) rawResults.push(r);
      });
    }

    // Rank the stocks using the RankingService
    const ranked = RankingService.rankStocks(rawResults);

    // Tag SECTOR_DIVERGENCE before the score gate/persist so it's always visible
    // in the UI and baked into signalSummary for downstream alert/journal gating.
    SectorRegimeService.applySectorDivergence(ranked);

    // Score gate: filter out completely useless results (score < 10)
    const filtered = ranked.filter(r => r.score >= 10);
    console.log(`[SCAN] Scanned: ${rawResults.length} | Ranked: ${ranked.length} | Passed gate (>=10): ${filtered.length}`);

    const scanDurationMs = Date.now() - startTime;

    // Cache first so cron/UI can read results without waiting for DB upserts.
    const cacheKey = `list:${universeName}:${market}`;
    await CacheService.set(cacheKey, filtered, 5 * 60);

    void ScannerController.persistScanResults({
      filtered,
      universeName,
      market,
      today,
      scanDurationMs,
    }).catch((err) => {
      console.error('[SCAN] Background persist failed:', err);
    });

    console.log(
      `[SCAN] Completed in ${scanDurationMs}ms (cache warm; DB persist queued for ${filtered.length} stocks).`
    );

    return filtered;
  }

  /** Fire-and-forget from executeScan — must not block HTTP or cron return. */
  static async persistScanResults(args: {
    filtered: Array<ScannerSignalResult & { score: number }>;
    universeName: string;
    market: string;
    today: string;
    scanDurationMs: number;
  }): Promise<void> {
    const { filtered, universeName, market, today, scanDurationMs } = args;
    const persistStart = Date.now();

    try {
      const CHUNK_SIZE = 15;
      for (let chunkIdx = 0; chunkIdx < filtered.length; chunkIdx += CHUNK_SIZE) {
        const chunk = filtered.slice(chunkIdx, chunkIdx + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (r) => {
            const signalsStr = r.signals.join(',');
            const dbSymbol = r.market === 'NSE' ? r.symbol : `${r.symbol}:BSE`;

            await prisma.scannerResult.upsert({
              where: {
                symbol_date: {
                  symbol: dbSymbol,
                  date: today,
                },
              },
              update: {
                ltp: r.ltp,
                volume: r.volume,
                pivot: r.pivot,
                bc: r.bc,
                tc: r.tc,
                r1: r.r1,
                r2: r.r2,
                r3: r.r3,
                r4: r.r4,
                s1: r.s1,
                s2: r.s2,
                s3: r.s3,
                s4: r.s4,
                width: r.width,
                classification: r.classification,
                score: r.score,
                confidence: r.confidence,
                signalSummary: signalsStr,
                entry: r.entry,
                sl: r.sl,
                target: r.target,
                rr: r.rr,
                target2: r.target2 ?? null,
                rr2: r.rr2 ?? null,
                vpaBreakdown: (r.vpaBreakdown as unknown as object) ?? null,
              },
              create: {
                symbol: dbSymbol,
                date: today,
                ltp: r.ltp,
                volume: r.volume,
                pivot: r.pivot,
                bc: r.bc,
                tc: r.tc,
                r1: r.r1,
                r2: r.r2,
                r3: r.r3,
                r4: r.r4,
                s1: r.s1,
                s2: r.s2,
                s3: r.s3,
                s4: r.s4,
                width: r.width,
                classification: r.classification,
                score: r.score,
                confidence: r.confidence,
                signalSummary: signalsStr,
                entry: r.entry,
                sl: r.sl,
                target: r.target,
                rr: r.rr,
                target2: r.target2 ?? null,
                rr2: r.rr2 ?? null,
                vpaBreakdown: (r.vpaBreakdown as unknown as object) ?? null,
              },
            });

            const previousClose = r.previousClose || r.open || r.ltp;
            const sessionOpen = r.open || r.ltp;
            await prisma.marketSnapshot.upsert({
              where: { symbol: dbSymbol },
              update: {
                price: previousClose,
                sessionOpen,
                previousClose,
                volume: r.volume,
                avgVolume: r.avgVolume,
                marketCap: r.marketCap,
                sector: r.sector,
              },
              create: {
                symbol: dbSymbol,
                price: previousClose,
                sessionOpen,
                previousClose,
                volume: r.volume,
                avgVolume: r.avgVolume,
                marketCap: r.marketCap,
                sector: r.sector,
              },
            });
          })
        );
      }

      const topSymbols = filtered.slice(0, 20).map(s => s.symbol).join(',');
      await prisma.scanHistory.create({
        data: {
          filtersJson: JSON.stringify({ universe: universeName, market }),
          resultCount: filtered.length,
          durationMs: scanDurationMs,
          topSymbols,
        },
      });

      const persistMs = Date.now() - persistStart;
      console.log(
        `Scanner database V2 persistence completed for ${filtered.length} stocks in ${persistMs}ms ` +
        `(scan ${scanDurationMs}ms).`
      );
    } catch (dbErr) {
      console.error('Error persisting scanner results to DB:', dbErr);
    }
  }
}
