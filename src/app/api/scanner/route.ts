import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { MarketSnapshot, ScannerResult } from '@prisma/client';
import { MarketService } from '@/services/market.service';
import { isScanInProgress } from '@/services/scanner-controller';
import { getISTDateString } from '@/lib/market-hours';
import { DatabaseCircuitBreaker } from '@/lib/circuit-breaker';
import { EventCalendarService } from '@/services/overnight/event.service';
import { loadWarmScanCache } from '@/lib/scanner-cache-read';
import {
  getUniverseSymbolMeta,
  isSymbolFrozenForScanner,
  isUniverseLiveForScanner,
  type ScannerUniverse,
} from '@/lib/scanner-session';
export const dynamic = 'force-dynamic';

async function enrichWithOptionSuggestions(
  results: Array<{ symbol: string; ltp: number; signalSummary?: string | null; entry?: number | null; sl?: number | null; target?: number | null; score: number }>,
  maxSymbols = 3
): Promise<Map<string, unknown>> {
  const suggestionMap = new Map<string, unknown>();
  if (results.length === 0) return suggestionMap;
  if (isScanInProgress() || MarketService.isFyersTemporarilyUnavailable()) {
    return suggestionMap;
  }

  try {
    const { OptionSuggestionService } = await import(
      '@/services/option-suggestion.service'
    );
    // Sequential lookups — avoid option-chain stampede during market hours.
    for (const r of results.slice(0, maxSymbols)) {
      const bias: 'BULLISH' | 'BEARISH' =
        r.signalSummary?.includes('BEARISH') ? 'BEARISH' : 'BULLISH';
      try {
        const suggestion = await OptionSuggestionService.suggestOption(
          r.symbol, r.ltp, bias, r.entry ?? 0, r.sl ?? 0, r.target ?? 0, getISTDateString()
        );
        if (suggestion) suggestionMap.set(r.symbol, suggestion);
      } catch (e) {
        console.warn(`[OptionSuggestion] Failed for ${r.symbol}:`, e);
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
          market: (r as { market?: string }).market ?? 'NSE',
          sector: (r as { sector?: string }).sector ?? 'Auto-Scan Cache',
          volumeRatio: (r as { volumeRatio?: number }).volumeRatio ?? 1.0,
        }));

        if (universeLive) {
          const topForOptions = formattedResults
            .filter((r) => r.score >= 75)
            .filter((r) => !isSymbolFrozenForScanner(r.symbol, universeFnOMap.get(r.symbol) === true))
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
          const suggestionMap = await enrichWithOptionSuggestions(topForOptions, 3);
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

    if (isScanInProgress()) {
      const warm = await loadWarmScanCache(universe, market);
      if (warm) {
        console.log(
          `[ScannerAPI] Scan in progress — serving warm ${warm.source} cache (${warm.data.length} rows).`
        );
      }
    }

    // 1. Resolve target date — never run a full scan on GET (cron owns writes).
    let targetDate = today;
    let scanPendingToday = false;
    try {
      const todayCount = await DatabaseCircuitBreaker.execute(() =>
        prisma.scannerResult.count({
          where: { date: today },
        })
      );
      if (todayCount === 0) {
        if (universeLive) {
          scanPendingToday = true;
          console.log(
            '[ScannerAPI] No scanner rows for today — serving latest available date; cpr-scan cron populates.'
          );
        }
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

    interface TempStock {
      symbol: string;
      score: number;
    }

    interface TempCell {
      count: number;
      scoreSum: number;
      stocks: TempStock[];
      topStock: string;
      topStockScore: number;
    }

    const initTempCell = (): TempCell => ({
      count: 0,
      scoreSum: 0,
      stocks: [],
      topStock: '',
      topStockScore: -1
    });

    const initTempSector = () => ({
      strongBuy: initTempCell(),
      breakout: initTempCell(),
      bullish: initTempCell(),
      bearish: initTempCell(),
      watch: initTempCell(),
      total: initTempCell()
    });

    const tempHeatmapSectors: Record<string, ReturnType<typeof initTempSector>> = {};

    // snapshotMap is built early here to resolve sectors from snapshots during the loop
    const snapshotMapEarly = new Map(matchingSnapshots.map((s: MarketSnapshot) => [s.symbol, s]));

    for (const r of fullStats) {
      if (r.score >= 75) strongBuyCount++;
      if (r.score >= 60 && r.score < 75) breakoutReadyCount++;
      if (r.score < 40 || (r.signalSummary.includes('BEARISH') && r.signalSummary.includes('WIDE'))) avoidCount++;

      const cleanSymbol = r.symbol.split(':')[0];
      const snap = snapshotMapEarly.get(r.symbol);
      const sec: string = (snap && snap.sector) ? snap.sector : 'Other';

      if (!tempHeatmapSectors[sec]) {
        tempHeatmapSectors[sec] = initTempSector();
      }
      const sector = tempHeatmapSectors[sec];
      const signals = r.signalSummary ? r.signalSummary.split(',') : [];

      let matched = false;

      const addToCell = (cell: TempCell) => {
        cell.count += 1;
        cell.scoreSum += r.score;
        cell.stocks.push({ symbol: cleanSymbol, score: r.score });
        if (r.score > cell.topStockScore) {
          cell.topStock = cleanSymbol;
          cell.topStockScore = r.score;
        }
        matched = true;
      };

      if (r.score >= 75) {
        addToCell(sector.strongBuy);
      }
      if (r.score >= 60 && r.score < 75) {
        addToCell(sector.breakout);
      }
      if (signals.includes('BULLISH') || signals.includes('ABOVE_VWAP')) {
        addToCell(sector.bullish);
      }
      if (signals.includes('BEARISH') || signals.includes('BELOW_VWAP')) {
        addToCell(sector.bearish);
      }
      if (r.score >= 40 && r.score < 60) {
        addToCell(sector.watch);
      }
      
      if (matched) {
        addToCell(sector.total);
      }
    }

    // Convert temp cells to final cells with sorted & capped symbol arrays
    interface HeatmapCell {
      count: number;
      avgScore: number;
      symbols: string[];
      topStock: string;
      topStockScore: number;
    }

    const heatmapSectors: Record<string, Record<string, HeatmapCell>> = {};

    for (const [sec, sectorData] of Object.entries(tempHeatmapSectors)) {
      const convertCell = (tempCell: TempCell): HeatmapCell => {
        const sortedStocks = tempCell.stocks.sort((a, b) => b.score - a.score);
        return {
          count: tempCell.count,
          avgScore: tempCell.count > 0 ? tempCell.scoreSum / tempCell.count : 0,
          symbols: sortedStocks.slice(0, 15).map(s => s.symbol),
          topStock: tempCell.topStock || '',
          topStockScore: tempCell.topStockScore >= 0 ? tempCell.topStockScore : 0
        };
      };

      heatmapSectors[sec] = {
        strongBuy: convertCell(sectorData.strongBuy),
        breakout: convertCell(sectorData.breakout),
        bullish: convertCell(sectorData.bullish),
        bearish: convertCell(sectorData.bearish),
        watch: convertCell(sectorData.watch),
        total: convertCell(sectorData.total)
      };
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
        target2: r.target2,
        rr2: r.rr2,
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
        .slice(0, 3);
      const suggestionMap = await enrichWithOptionSuggestions(topForOptions, 3);
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
      ...(scanPendingToday ? { scanPendingToday: true, dataDate: targetDate } : {}),
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
