import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { MarketSnapshot, ScannerResult } from '@prisma/client';
import { ScannerController } from '@/services/scanner-controller';
import { MarketService } from '@/services/market.service';
import { getISTDateString } from '@/lib/market-hours';
import { DatabaseCircuitBreaker } from '@/lib/circuit-breaker';
import { EventCalendarService } from '@/services/overnight/event.service';
import {
  getUniverseSymbolMeta,
  isSymbolFrozenForScanner,
  isUniverseLiveForScanner,
  type ScannerUniverse,
} from '@/lib/scanner-session';
export const dynamic = 'force-dynamic';

async function enrichWithOptionSuggestions(
  results: Array<{ symbol: string; ltp: number; signalSummary?: string | null; entry?: number | null; sl?: number | null; target?: number | null; score: number }>
): Promise<Map<string, unknown>> {
  const suggestionMap = new Map<string, unknown>();
  try {
    const { OptionSuggestionService } = await import(
      '@/services/option-suggestion.service'
    );
    const enrichmentPromises = results.map(async (r) => {
      const bias: 'BULLISH' | 'BEARISH' = 
        r.signalSummary?.includes('BEARISH') ? 'BEARISH' : 'BULLISH';
      try {
        const suggestion = await OptionSuggestionService.suggestOption(
          r.symbol, r.ltp, bias, r.entry ?? 0, r.sl ?? 0, r.target ?? 0, getISTDateString()
        );
        return { symbol: r.symbol, suggestion };
      } catch (e) {
        console.warn(`[OptionSuggestion] Failed for ${r.symbol}:`, e);
        return { symbol: r.symbol, suggestion: { error: 'FETCH_EXCEPTION' } };
      }
    });
    const settled = await Promise.allSettled(enrichmentPromises);
    for (const res of settled) {
      if (res.status === 'fulfilled' && res.value?.suggestion) {
        suggestionMap.set(res.value.symbol, res.value.suggestion);
      }
    }
  } catch (err) {
    console.error('[OptionSuggestion] Enrichment failed:', err);
  }
  return suggestionMap;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const market = (searchParams.get('market') || 'NSE') as 'NSE' | 'BSE';
  const universe = (searchParams.get('universe') || 'NIFTY50') as ScannerUniverse;
  try {
    const mode = searchParams.get('mode') || 'ALL'; // NARROW | WIDE | BULLISH | BEARISH | BREAKOUT | etc.
    const limitParam = searchParams.get('limit') || '10';
    const isAll = limitParam === 'ALL';
    // Cap every path — including limit=ALL — so a single request cannot load an
    // unbounded Prisma result set into memory. Auth gates this route, but an
    // authenticated client can still OOM the process without a hard ceiling.
    const MAX_SCANNER_LIMIT = 500;
    const page = isAll ? 1 : Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const parsedLimit = parseInt(limitParam, 10);
    const limit = isAll
      ? MAX_SCANNER_LIMIT
      : Math.min(Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 10), MAX_SCANNER_LIMIT);
    const ALLOWED_SORT_FIELDS = new Set([
      'score', 'ltp', 'volume', 'width', 'pivot', 'bc', 'tc', 'createdAt', 'updatedAt', 'date', 'symbol'
    ]);
    const sortField = ALLOWED_SORT_FIELDS.has(searchParams.get('sortField') || '')
      ? (searchParams.get('sortField') as string)
      : 'score';
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

    // V2 Advanced Filters
    const sector = searchParams.get('sector') || 'ALL';
    const marketCapCategory = searchParams.get('marketCapCategory') || 'ALL'; // ALL | LARGE | MID | SMALL
    const minPrice = searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined;
    const maxPrice = searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined;
    const minScore = searchParams.get('minScore') ? parseInt(searchParams.get('minScore')!, 10) : undefined;
    const maxScore = searchParams.get('maxScore') ? parseInt(searchParams.get('maxScore')!, 10) : undefined;
    const minWidth = searchParams.get('minWidth') ? parseFloat(searchParams.get('minWidth')!) : undefined;
    const maxWidth = searchParams.get('maxWidth') ? parseFloat(searchParams.get('maxWidth')!) : undefined;
    
    const cprRelationship = searchParams.get('cprRelationship') || 'ALL';
    const virginCpr = searchParams.get('virginCpr') === 'true';
    const narrowCpr = searchParams.get('narrowCpr') === 'true';
    
    const search = searchParams.get('search')?.trim() || '';

    const today = getISTDateString();
    const universeStocks = getUniverseSymbolMeta(universe);
    const universeFnOMap = new Map(universeStocks.map((stock) => [stock.symbol, stock.isFnO]));
    const universeLive = isUniverseLiveForScanner(universe);

    const useCache = searchParams.get('useCache') === 'true';
    if (useCache) {
      const { CacheService, autoScanResultCacheKey } = await import('@/services/cache.service');
      const cached = await CacheService.get(autoScanResultCacheKey(universe, market));
      if (cached && typeof cached === 'object' && 'data' in cached) {
        // Type the cached items — they come from AutoScanResult which always
        // has symbol, ltp, score, tc, bc, r1 at minimum.
        interface CachedScanItem {
          symbol: string;
          ltp: number;
          score: number;
          tc?: number;
          bc?: number;
          r1?: number;
          signalSummary?: string | null;
          [key: string]: unknown;
        }
        const cachedData = cached as { data: CachedScanItem[]; timestamp?: string };
        const formattedResults = cachedData.data.map((r) => ({
          ...r,
          market: 'NSE',
          sector: 'Auto-Scan Cache',
          volumeRatio: 1.0,
          entry: r.tc ?? null,
          sl: r.bc ?? null,
          target: r.r1 ?? null,
          rr: 1.5,
        }));

        if (universeLive) {
          const topForOptions = formattedResults
            .filter((r) => r.score >= 75)
            .filter((r) => !isSymbolFrozenForScanner(r.symbol, universeFnOMap.get(r.symbol) === true))
            .sort((a, b) => b.score - a.score)
            .slice(0, 10);
          const suggestionMap = await enrichWithOptionSuggestions(topForOptions);
          for (const r of formattedResults) {
            if (suggestionMap.has(r.symbol)) {
              (r as Record<string, unknown>).optionSuggestion = suggestionMap.get(r.symbol);
            }
          }
        }

        return NextResponse.json({
          success: true,
          page: 1,
          limit: formattedResults.length,
          total: formattedResults.length,
          totalPages: 1,
          universeCount: formattedResults.length,
          totalScanned: formattedResults.length,
          totalReturned: formattedResults.length,
          filteredOut: 0,
          results: formattedResults,
          insights: { strongBuy: 0, breakoutReady: 0, avoid: 0 },
          fromCache: true,
          scannedAt: cachedData.timestamp,
          cachedAt: cachedData.timestamp
        }, { status: 200 });
      }
    }



    // If circuit is open, fallback to cache immediately — before any of the
    // DB query sites below (auto-init count/latest, marketSnapshot.findMany,
    // scannerResult batch, topForOptions findMany, scannedAt lookups) are reached.
    if (DatabaseCircuitBreaker.isOpen()) {
      return await serveDegradedScannerCache(universe, market);
    }

    // 1. Auto-initialize today's database records if empty (LIVE SESSION ONLY)
    let targetDate = today;
    try {
      const todayCount = await DatabaseCircuitBreaker.execute(() =>
        prisma.scannerResult.count({
          where: { date: today },
        })
      );
      if (todayCount === 0) {
        if (universeLive) {
          console.log("No scanner records found for today during live session. Performing auto-scan initialization...");
          await ScannerController.runFullScan('ALL', 'NSE');
          await ScannerController.runFullScan('ALL', 'BSE');
        } else {
          // Outside live session: serve frozen results from the latest available date
          const latestRecord = await DatabaseCircuitBreaker.execute(() =>
            prisma.scannerResult.findFirst({
              orderBy: { date: 'desc' },
              select: { date: true },
            })
          );
          if (latestRecord) {
            targetDate = latestRecord.date;
          }
        }
      }
    } catch (dbErr) {
      // A DB connectivity failure here trips the breaker (inside execute())
      // and rethrows CIRCUIT_OPEN — let the outer catch route to the
      // degraded cache immediately instead of silently continuing with
      // whatever partial state we have.
      if (dbErr instanceof Error && dbErr.message === 'CIRCUIT_OPEN') {
        throw dbErr;
      }
      console.warn("DB check failed during initial get, continuing:", dbErr);
    }

    // 2. Map universe stock symbols to database keys
    const baseSymbols = universeStocks.map((s) => s.symbol.trim());
    const dbSymbols = baseSymbols.map((s: string) => market === 'NSE' ? s : `${s}:BSE`);

    // 3. Query MarketSnapshot for Sector and Market Cap filtering
    const snapshotWhere: {
      symbol: { in: string[] };
      sector?: string;
      marketCap?: { gte?: number; lte?: number; lt?: number };
    } = {
      symbol: { in: dbSymbols }
    };
    if (sector !== 'ALL') {
      snapshotWhere.sector = sector;
    }
    if (marketCapCategory !== 'ALL') {
      if (marketCapCategory === 'LARGE') {
        snapshotWhere.marketCap = { gte: 20000 };
      } else if (marketCapCategory === 'MID') {
        snapshotWhere.marketCap = { gte: 5000, lte: 20000 };
      } else if (marketCapCategory === 'SMALL') {
        snapshotWhere.marketCap = { lt: 5000 };
      }
    }

    const matchingSnapshots = await DatabaseCircuitBreaker.execute<MarketSnapshot[]>(() =>
      prisma.marketSnapshot.findMany({
        where: snapshotWhere
      })
    );
    
    const finalDbSymbols = matchingSnapshots.map((s: MarketSnapshot) => s.symbol);
    
    const searchedSymbols = search 
      ? finalDbSymbols.filter((s: string) => s.split(':')[0].toLowerCase().includes(search.toLowerCase()))
      : finalDbSymbols;

    // 4. Build ScannerResult Query Conditions
    const where: {
      symbol: { in: string[] };
      date: string;
      signalSummary?: { contains: string };
      ltp?: { gte?: number; lte?: number };
      score?: { gte?: number; lte?: number };
      width?: { gte?: number; lte?: number };
    } = {
      symbol: { in: searchedSymbols },
      date: targetDate,
    };

    const andConditions: Record<string, unknown>[] = [];

    // Filter by Active Signal modes
    if (mode !== 'ALL') {
      andConditions.push({ signalSummary: { contains: mode } });
    }
    if (cprRelationship !== 'ALL') {
      andConditions.push({ signalSummary: { contains: cprRelationship } });
    }
    if (virginCpr) {
      andConditions.push({ signalSummary: { contains: 'VIRGIN' } });
    }
    if (narrowCpr) {
      andConditions.push({ classification: 'NARROW' });
    }

    if (andConditions.length > 0) {
      (where as unknown as { AND: unknown[] }).AND = andConditions;
    }

    // Price Filter
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.ltp = {};
      if (minPrice !== undefined) where.ltp.gte = minPrice;
      if (maxPrice !== undefined) where.ltp.lte = maxPrice;
    }

    // Score Filter
    if (minScore !== undefined || maxScore !== undefined) {
      where.score = {};
      if (minScore !== undefined) where.score.gte = minScore;
      if (maxScore !== undefined) where.score.lte = maxScore;
    }

    // Width Filter
    if (minWidth !== undefined || maxWidth !== undefined) {
      where.width = {};
      if (minWidth !== undefined) where.width.gte = minWidth;
      if (maxWidth !== undefined) where.width.lte = maxWidth;
    }

    // 5. Query Database
    const offset = (page - 1) * limit;
    
    const [results, total, fullStats] = await DatabaseCircuitBreaker.execute(() => Promise.all([
      prisma.scannerResult.findMany({
        where,
        orderBy: {
          [sortField]: sortOrder,
        },
        skip: offset,
        take: limit,
      }),
      prisma.scannerResult.count({ where }),
      prisma.scannerResult.findMany({
        where,
        select: { symbol: true, score: true, signalSummary: true }
      })
    ]));

    let strongBuyCount = 0;
    let breakoutReadyCount = 0;
    let avoidCount = 0;

    // Per-sector bucket aggregation — full universe (not page-limited).
    // Thresholds match SIMPLE_SCORE constants (75 / 60 / 40) used by the client-side heatmap.
    const heatmapSectors: Record<string, {
      strongBuy: number;
      breakout: number;
      bullish: number;
      bearish: number;
      watch: number;
      total: number;
    }> = {};

    // snapshotMap is built just below in step 6 — we build it early here to reuse for the heatmap.
    const snapshotMapEarly = new Map(matchingSnapshots.map((s: MarketSnapshot) => [s.symbol, s]));

    for (const r of fullStats) {
      if (r.score >= 75) strongBuyCount++;
      if (r.score >= 60 && r.score < 75) breakoutReadyCount++;
      if (r.score < 40 || (r.signalSummary.includes('BEARISH') && r.signalSummary.includes('WIDE'))) avoidCount++;

      // Resolve sector via symbol → snapshot join (same lookup the client side does via formattedResults)
      const snap = snapshotMapEarly.get(r.symbol);
      const sec: string = (snap && snap.sector) ? snap.sector : 'Other';

      if (!heatmapSectors[sec]) {
        heatmapSectors[sec] = { strongBuy: 0, breakout: 0, bullish: 0, bearish: 0, watch: 0, total: 0 };
      }
      const bucket = heatmapSectors[sec];
      const signals = r.signalSummary ? r.signalSummary.split(',') : [];

      let matched = false;
      if (r.score >= 75) { bucket.strongBuy++; matched = true; }
      if (r.score >= 60 && r.score < 75) { bucket.breakout++; matched = true; }
      if (signals.includes('BULLISH') || signals.includes('ABOVE_VWAP')) { bucket.bullish++; matched = true; }
      if (signals.includes('BEARISH') || signals.includes('BELOW_VWAP')) { bucket.bearish++; matched = true; }
      if (r.score >= 40 && r.score < 60) { bucket.watch++; matched = true; }
      if (matched) bucket.total++;
    }

    // 6. Join Metadata from MarketSnapshots — use stored SL/Target/RR values directly
    const snapshotMap = new Map(matchingSnapshots.map((s: MarketSnapshot) => [s.symbol, s]));
    
    // Bulk fetch event risks for the current page of results
    const resultSymbols = results.map((r: ScannerResult) => r.symbol.split(':')[0]);
    const todayStr = getISTDateString();
    const eventRisks = await EventCalendarService.getBulkEventRisk(resultSymbols, todayStr);

    const formattedResults = results.map((r: ScannerResult) => {
      const snap = snapshotMap.get(r.symbol);
      const cleanSymbol = r.symbol.split(':')[0];
      const risk = eventRisks[cleanSymbol];

      return {
        ...r,
        symbol: cleanSymbol,
        market,
        sector: snap ? snap.sector : 'Other',
        // sessionOpen = exchange open; price/previousClose = prior close for day %
        open: snap
          ? (snap.sessionOpen > 0 ? snap.sessionOpen : snap.price)
          : r.ltp,
        price: snap
          ? (snap.previousClose > 0 ? snap.previousClose : snap.price)
          : r.ltp,
        previousClose: snap
          ? (snap.previousClose > 0 ? snap.previousClose : snap.price)
          : undefined,
        avgVolume: snap ? snap.avgVolume : r.volume,
        marketCap: snap ? snap.marketCap : 50000,
        signals: r.signalSummary ? r.signalSummary.split(',') : [],
        volumeRatio: (snap && snap.avgVolume > 0) ? r.volume / snap.avgVolume : 1.0,
        entry: r.entry,
        sl: r.sl,
        target: r.target,
        rr: r.rr,
        eventRiskScore: risk ? risk.severity : 0,
        eventRiskReason: risk ? risk.reason : null,
      };
    });

    if (universeLive) {
      const topForOptions = (formattedResults as Array<{
        symbol: string;
        ltp: number;
        signalSummary?: string | null;
        entry?: number | null;
        sl?: number | null;
        target?: number | null;
        score: number;
      }>)
        .filter((r) => r.score >= 75)
        .filter((r) => !isSymbolFrozenForScanner(r.symbol, universeFnOMap.get(r.symbol) === true))
        .slice(0, 10);
      const suggestionMap = await enrichWithOptionSuggestions(topForOptions);
      for (const r of formattedResults) {
        if (suggestionMap.has(r.symbol)) {
          (r as Record<string, unknown>).optionSuggestion = suggestionMap.get(r.symbol);
        }
      }
    }

    const universeCount = MarketService.getUniverseCount(universe);

    let scannedAt: string | null = null;
    try {
      const lastRun = await DatabaseCircuitBreaker.execute(() =>
        prisma.scanHistory.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        })
      );
      if (lastRun?.createdAt) {
        scannedAt = lastRun.createdAt.toISOString();
      } else {
        const lastResult = await DatabaseCircuitBreaker.execute(() =>
          prisma.scannerResult.findFirst({
            where: { date: today },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          })
        );
        if (lastResult?.createdAt) {
          scannedAt = lastResult.createdAt.toISOString();
        }
      }
    } catch (scannedAtErr) {
      console.warn('[ScannerAPI] Could not fetch last scan timestamp:', scannedAtErr);
    }

    return NextResponse.json({
      success: true,
      page,
      limit,
      total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      universeCount,
      totalScanned: universeStocks.length,
      totalReturned: formattedResults.length,
      filteredOut: universeStocks.length - formattedResults.length,
      scannedAt,
      results: formattedResults,
      insights: {
        strongBuy: strongBuyCount,
        breakoutReady: breakoutReadyCount,
        avoid: avoidCount,
        heatmapSectors,
      }
    }, { status: 200 });
  } catch (err) {
    // Forced DB failure in any wrapped query trips the breaker and throws
    // CIRCUIT_OPEN — fall back to cache the same way the isOpen() early-return does.
    if (err instanceof Error && err.message === 'CIRCUIT_OPEN') {
      return await serveDegradedScannerCache(universe, market);
    }
    console.error('Error fetching V2 scanner data:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching scanner data' },
      { status: 500 }
    );
  }
}

/** Shared degraded response for isOpen() early-return and CIRCUIT_OPEN catch. */
async function serveDegradedScannerCache(
  universe = 'NIFTY_FNO',
  market = 'NSE'
): Promise<NextResponse> {
  const { CacheService, autoScanResultCacheKey } = await import('@/services/cache.service');
  const primary = await CacheService.get(autoScanResultCacheKey(universe, market));
  const cached =
    primary && typeof primary === 'object' && 'data' in primary
      ? primary
      : await CacheService.get(autoScanResultCacheKey('NIFTY_FNO', 'NSE'));
  if (cached && typeof cached === 'object' && 'data' in cached) {
    const cachedData = cached as { data: unknown[]; timestamp?: string };
    return NextResponse.json({
      success: true,
      degraded: true,
      message: 'Serving cached data because the database is temporarily unavailable.',
      cachedAt: cachedData.timestamp,
      results: cachedData.data,
      fromCache: true
    });
  }
  return NextResponse.json(
    { success: false, degraded: true, message: 'Database is unavailable and no cache is available', results: [] },
    { status: 503 }
  );
}
