import { env } from '@/config/env';
import { prisma } from '@/lib/db';
import { CacheService } from './cache.service';
import { MarketService } from './market.service';
import { ScannerService, ScannerSignalResult } from './scanner.service';
import { RankingService } from './ranking.service';
import { getISTDateString } from '@/lib/market-hours';

// Removed module-level PERSISTENT_FAILURES Map, using CacheService instead

let inFlightScanPromise: Promise<Array<ScannerSignalResult & { score: number }>> | null = null;

export class ScannerController {
  /**
   * Runs a complete stock scanner execution for a specific universe and market.
   */
  static async runFullScan(
    universeName: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST' = 'NSE_FNO',
    market: 'NSE' | 'BSE' = 'NSE'
  ): Promise<Array<ScannerSignalResult & { score: number }>> {
    if (inFlightScanPromise) {
      console.log('[SCAN] Scan already in progress — reusing in-flight scan promise.');
      return inFlightScanPromise;
    }

    inFlightScanPromise = (async () => {
      try {
        return await ScannerController.executeScan(universeName, market);
      } finally {
        inFlightScanPromise = null;
      }
    })();

    return inFlightScanPromise;
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
      // Import here to avoid circular dependency issues if any
      const { QueueService } = await import('./queue.service');
      if (QueueService.isEnabled && QueueService.scannerQueue) {
        console.log(`Offloading scan to queue (threshold ${queueThreshold} exceeded by ${stocks.length} symbols).`);
        try {
          await Promise.race([
            QueueService.scannerQueue.add('full-scan', { universeName, market, stocks }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000))
          ]);
          // No BullMQ worker is wired in this repo for full-scan. Falling through to
          // inline execution avoids refresh/cron reporting success with an empty result.
          console.warn('[ScannerController] Queue job enqueued but no worker exists; executing scan inline.');
        } catch (error) {
          console.warn(`[${universeName}] Queue add timed out or failed. Falling back to sync scan. Note: If this was a timeout, the job might eventually enqueue as a duplicate once BullMQ reconnects (accepted tradeoff). Error: ${error}`);
        }
      } else {
        console.warn('Queue is disabled or unavailable. Falling back to sync execution.');
      }
    }

    const rawResults: ScannerSignalResult[] = [];

    // Parallel fetch with batching to avoid API rate limits (batches of 10)
    const batchSize = 10;
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
            return await ScannerService.scanStock(data);
          }
        } catch (err) {
          const sym = stockMeta.symbol;
          const failureCacheKey = `failure_count_${sym}`;
          const failCount = (await CacheService.get<number>(failureCacheKey) || 0) + 1;
          await CacheService.set(failureCacheKey, failCount, 86400); // Persist failure count for a day
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

    // Score gate: filter out completely useless results (score < 10)
    const filtered = ranked.filter(r => r.score >= 10);
    const today = getISTDateString();
    console.log(`[SCAN] Scanned: ${rawResults.length} | Ranked: ${ranked.length} | Passed gate (>=10): ${filtered.length}`);

    // Background database persist (upserts)
    try {
      await Promise.all(
        filtered.map(async (r) => {
          const signalsStr = r.signals.join(',');
          const dbSymbol = r.market === 'NSE' ? r.symbol : `${r.symbol}:BSE`;

          // 1. Upsert ScannerResult (Stores calculation outputs)
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
            },
          });

          // 2. Upsert MarketSnapshot (Real-time metadata cache)
          await prisma.marketSnapshot.upsert({
            where: { symbol: dbSymbol },
            update: {
              price: r.open,
              volume: r.volume,
              avgVolume: r.avgVolume,
              marketCap: r.marketCap,
              sector: r.sector,
            },
            create: {
              symbol: dbSymbol,
              price: r.open,
              volume: r.volume,
              avgVolume: r.avgVolume,
              marketCap: r.marketCap,
              sector: r.sector,
            },
          });
        })
      );
      
      const durationMs = Date.now() - startTime;
      const topSymbols = filtered.slice(0, 20).map(s => s.symbol).join(',');

      // 3. Log Scan History Run
      await prisma.scanHistory.create({
        data: {
          filtersJson: JSON.stringify({ universe: universeName, market }),
          resultCount: filtered.length,
          durationMs,
          topSymbols,
        },
      });

      console.log(`Scanner database V2 persistence completed for ${filtered.length} stocks in ${durationMs}ms.`);
    } catch (dbErr) {
      console.error('Error persisting scanner results to DB:', dbErr);
    }

    // Cache the filtered list for 5 minutes (300 seconds)
    const cacheKey = `list:${universeName}:${market}`;
    await CacheService.set(cacheKey, filtered, 120);

    return filtered;
  }
}
