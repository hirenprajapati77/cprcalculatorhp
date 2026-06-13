import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ScannerController } from '@/services/scanner-controller';
import { MarketService } from '@/services/market.service';

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
    
    const [results, total] = await Promise.all([
      prisma.scannerResult.findMany({
        where,
        orderBy: {
          [sortField]: sortOrder,
        },
        ...(isAll ? {} : { skip: offset, take: limit }),
      }),
      prisma.scannerResult.count({ where }),
    ]);

    // 6. Join Metadata from MarketSnapshots and calculate Trade setups
    const formattedResults = results.map((r) => {
      const snap = matchingSnapshots.find(s => s.symbol === r.symbol);
      const cleanSymbol = r.symbol.split(':')[0]; // Remove :BSE suffix for UI uniformity

      // Derive Entry, SL, Target and RR on-the-fly
      const bias = r.ltp > r.tc ? 'BULLISH' : r.ltp < r.bc ? 'BEARISH' : 'RANGE';
      let entry = 0;
      let sl = 0;
      let target = 0;
      let rrRatio = 1.0;

      if (bias === 'BULLISH') {
        entry = r.tc;
        sl = r.bc;
        target = r.r2;
        const risk = entry - sl;
        const reward = target - entry;
        rrRatio = risk > 0 ? reward / risk : 1.0;
      } else if (bias === 'BEARISH') {
        entry = r.bc;
        sl = r.tc;
        target = r.s2;
        const risk = sl - entry;
        const reward = entry - target;
        rrRatio = risk > 0 ? reward / risk : 1.0;
      } else {
        entry = r.pivot;
        if (r.ltp >= r.pivot) {
          sl = r.s1;
          target = r.r1;
        } else {
          sl = r.r1;
          target = r.s1;
        }
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(target - entry);
        rrRatio = risk > 0 ? reward / risk : 1.0;
      }

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
        entry,
        sl,
        target,
        rr: `1:${rrRatio.toFixed(1)}`,
      };
    });

    return NextResponse.json({
      success: true,
      page,
      limit,
      total,
      totalPages: limit ? Math.ceil(total / limit) : 1,
      results: formattedResults,
    }, { status: 200 });
  } catch (err) {
    console.error('Error fetching V2 scanner data:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching scanner data' },
      { status: 500 }
    );
  }
}
