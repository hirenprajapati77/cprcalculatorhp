import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { MarketSnapshot, ScannerResult } from '@prisma/client';
import { getISTDateString } from '@/lib/market-hours';
import { isActionableScannerTopResult } from '@/lib/cpr-setup-staleness';
import { sanitizePagination } from '@/lib/pagination';

const MAX_TOP_LIMIT = 50;
const MAX_CANDIDATE_POOL = 100;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { limit } = sanitizePagination(1, searchParams.get('limit'), MAX_TOP_LIMIT, 5);
    const rawMarket = searchParams.get('market') || 'NSE';
    const market = rawMarket === 'BSE' ? 'BSE' : 'NSE';

    const today = getISTDateString();

    // Separate NSE vs BSE records by symbol suffix
    const symbolCondition = market === 'BSE' 
      ? { contains: ':BSE' }
      : { not: { contains: ':BSE' } };

    // Derived candidate pool take: strictly bounded between 30 and 100
    const candidateTake = Math.min(Math.max(limit * 4, 30), MAX_CANDIDATE_POOL);

    // P0: Exclude dead/invalidated setups (GAP_INVALIDATED, STALE_SETUP, target met)
    // from top algo ranking so it falls through to clean actionable setups.
    const candidatePool = await prisma.scannerResult.findMany({
      where: {
        date: today,
        symbol: symbolCondition,
        alertSuppressedReason: null,
        NOT: {
          signalSummary: { contains: 'STALE_SETUP' },
        },
      },
      orderBy: {
        score: 'desc',
      },
      take: candidateTake,
    });

    const actionable = candidatePool.filter(isActionableScannerTopResult);
    const topOpportunities = actionable.slice(0, limit);

    // Query sectors matching symbols for visual metadata
    const symbols = topOpportunities.map((o: ScannerResult) => o.symbol);
    const snapshots = await prisma.marketSnapshot.findMany({
      where: { symbol: { in: symbols } },
    });

    const formatted = topOpportunities.map((r: ScannerResult) => {
      const snap = snapshots.find((s: MarketSnapshot) => s.symbol === r.symbol);
      const cleanSymbol = r.symbol.split(':')[0];

      return {
        ...r,
        symbol: cleanSymbol,
        market,
        sector: snap ? snap.sector : 'Other',
        price: snap ? snap.price : r.ltp,
        signals: r.signalSummary ? r.signalSummary.split(',') : [],
      };
    });

    return NextResponse.json({
      success: true,
      limit,
      results: formatted,
    }, { status: 200 });
  } catch (err) {
    console.error('Error fetching top scanner opportunities:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching top opportunities' },
      { status: 500 }
    );
  }
}
