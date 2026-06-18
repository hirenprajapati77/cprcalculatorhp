import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ScannerController } from '@/services/scanner-controller';
import { MarketService } from '@/services/market.service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const market = (searchParams.get('market') || 'NSE') as 'NSE' | 'BSE';
    const universe = (searchParams.get('universe') || 'NIFTY50') as 'NIFTY50' | 'NIFTY200' | 'NIFTY_FNO' | 'ALL';
    const mode = searchParams.get('mode') || 'ALL'; // NARROW | WIDE | BULLISH | BEARISH | BREAKOUT | etc.
    const limitParam = searchParams.get('limit') || '10';
    const isAll = limitParam === 'ALL';
    const page = isAll ? 1 : parseInt(searchParams.get('page') || '1', 10);
    const limit = isAll ? undefined : parseInt(limitParam, 10);
    const sortField = searchParams.get('sortField') || 'score';
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

    const today = new Date().toISOString().split('T')[0];

    const useCache = searchParams.get('useCache') === 'true';
    if (useCache) {
      const { CacheService } = await import('@/services/cache.service');
      const cached = await CacheService.get('AUTO_SCAN_RESULT');
      if (cached && (cached as any).data) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const formattedResults = (cached as any).data.map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          ...r,
          market: 'NSE',
          sector: 'Auto-Scan Cache',
          volumeRatio: 1.0,
          entry: r.tc,
          sl: r.bc,
          target: r.r1,
          rr: 1.5,
        }));

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
          cachedAt: cached.timestamp
        }, { status: 200 });
      }
    }


    // 1. Auto-initialize today's database records if empty
    try {
      const todayCount = await prisma.scannerResult.count({
        where: { date: today },
      });
      if (todayCount === 0) {
        console.log("No scanner records found for today. Performing auto-scan initialization...");
        await ScannerController.runFullScan('ALL', 'NSE');
        await ScannerController.runFullScan('ALL', 'BSE');
      }
    } catch (dbErr) {
      console.warn("DB check failed during initial get, continuing:", dbErr);
    }

    // 2. Map universe stock symbols to database keys
    const universeStocks = MarketService.getUniverse(universe);
    const baseSymbols = universeStocks.map(s => s.symbol);
    const dbSymbols = baseSymbols.map(s => market === 'NSE' ? s : `${s}:BSE`);

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

    const matchingSnapshots = await prisma.marketSnapshot.findMany({
      where: snapshotWhere
    });
    
    const finalDbSymbols = matchingSnapshots.map(s => s.symbol);

    // 4. Build ScannerResult Query Conditions
    const where: {
      symbol: { in: string[] };
      date: string;
      signalSummary?: { contains: string };
      ltp?: { gte?: number; lte?: number };
      score?: { gte?: number; lte?: number };
      width?: { gte?: number; lte?: number };
    } = {
      symbol: { in: finalDbSymbols },
      date: today,
    };

    // Filter by Active Signal modes
    if (mode !== 'ALL') {
      where.signalSummary = {
        contains: mode,
      };
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
    const offset = isAll ? undefined : (page - 1) * limit!;
    
    const [results, total, fullStats] = await Promise.all([
      prisma.scannerResult.findMany({
        where,
        orderBy: {
          [sortField]: sortOrder,
        },
        ...(isAll || offset === undefined ? {} : { skip: offset }),
        ...(isAll || limit === undefined ? {} : { take: limit }),
      }),
      prisma.scannerResult.count({ where }),
      prisma.scannerResult.findMany({
        where,
        select: { score: true, signalSummary: true }
      })
    ]);

    let strongBuyCount = 0;
    let breakoutReadyCount = 0;
    let avoidCount = 0;

    for (const r of fullStats) {
      if (r.score >= 90) strongBuyCount++;
      if (r.signalSummary.includes('BREAKOUT') && r.signalSummary.includes('NARROW')) breakoutReadyCount++;
      if (r.score < 40 || (r.signalSummary.includes('BEARISH') && r.signalSummary.includes('WIDE'))) avoidCount++;
    }

    // 6. Join Metadata from MarketSnapshots — use stored SL/Target/RR values directly
    const formattedResults = results.map((r) => {
      const snap = matchingSnapshots.find(s => s.symbol === r.symbol);
      const cleanSymbol = r.symbol.split(':')[0];

      return {
        ...r,
        symbol: cleanSymbol,
        market,
        sector: snap ? snap.sector : 'Other',
        open: snap ? snap.price : r.ltp,
        price: snap ? snap.price : r.ltp,
        avgVolume: snap ? snap.avgVolume : r.volume,
        marketCap: snap ? snap.marketCap : 50000,
        signals: r.signalSummary ? r.signalSummary.split(',') : [],
        volumeRatio: (snap && snap.avgVolume > 0) ? r.volume / snap.avgVolume : 1.0,
        entry: r.entry,
        sl: r.sl,
        target: r.target,
        rr: r.rr,
      };
    });

    const universeCount = MarketService.getUniverseCount(universe);

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
      results: formattedResults,
      insights: {
        strongBuy: strongBuyCount,
        breakoutReady: breakoutReadyCount,
        avoid: avoidCount,
      }
    }, { status: 200 });
  } catch (err) {
    console.error('Error fetching V2 scanner data:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching scanner data' },
      { status: 500 }
    );
  }
}
