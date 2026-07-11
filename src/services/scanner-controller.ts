import { prisma } from '@/lib/db';
import { CacheService } from './cache.service';
import { MarketService } from './market.service';
import { ScannerService, ScannerSignalResult } from './scanner.service';
import { RankingService } from './ranking.service';

// Module-level failure tracker — persists across scan runs within the same process
const PERSISTENT_FAILURES = new Map<string, number>();

export class ScannerController {
  /**
   * Runs a complete stock scanner execution for a specific universe and market.
   *
   * Flow:
   * 1. Fetch stock tickers in the universe
   * 2. Download historical OHLC, volume, and live LTP in parallel batches
   * 3. Compute CPR, signals, entry target, stop loss, and RR ratios
   * 4. Score and Rank stocks (highest score descending, capped at 100)
   * 5. Save/Upsert ScannerResult records (with signalSummary)
   * 6. Cache/Upsert MarketSnapshot metadata records
   * 7. Save a ScanHistory log entry with duration, filter criteria, and top 20 tickers
   * 8. Cache the full ranked list for 5 minutes
   */
  static async runFullScan(
    universeName: 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST' = 'NSE_FNO',
    market: 'NSE' | 'BSE' = 'NSE'
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

    const execMode = process.env.EXECUTION_MODE || 'auto';
    const queueThreshold = parseInt(process.env.SCAN_QUEUE_THRESHOLD || '75', 10);
    
    const shouldQueue = 
      execMode === 'queue' || 
      (execMode === 'auto' && stocks.length >= queueThreshold);

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
          return []; // Return empty or a job status indicator in a real app
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
        if ((PERSISTENT_FAILURES.get(stockMeta.symbol) || 0) >= 3) return null;

        try {
          const data = await MarketService.getStockData(stockMeta.symbol, market);
          if (data) {
            // Reset failure count on success
            PERSISTENT_FAILURES.delete(stockMeta.symbol);
            return ScannerService.scanStock(data);
          }
        } catch (err) {
          const sym = stockMeta.symbol;
          const failCount = (PERSISTENT_FAILURES.get(sym) || 0) + 1;
          PERSISTENT_FAILURES.set(sym, failCount);
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
    const today = new Date().toISOString().split('T')[0];
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
    await CacheService.set(cacheKey, filtered, 300);

    return filtered;
  }
}
