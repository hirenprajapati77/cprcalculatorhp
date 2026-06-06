import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '5', 10);
    const market = searchParams.get('market') || 'NSE';

    const today = new Date().toISOString().split('T')[0];

    // Separate NSE vs BSE records by symbol suffix
    const symbolCondition = market === 'BSE' 
      ? { contains: ':BSE' }
      : { not: { contains: ':BSE' } };

    const topOpportunities = await prisma.scannerResult.findMany({
      where: {
        date: today,
        symbol: symbolCondition,
      },
      orderBy: {
        score: 'desc',
      },
      take: limit,
    });

    // Query sectors matching symbols for visual metadata
    const symbols = topOpportunities.map(o => o.symbol);
    const snapshots = await prisma.marketSnapshot.findMany({
      where: { symbol: { in: symbols } },
    });

    const formatted = topOpportunities.map((r) => {
      const snap = snapshots.find(s => s.symbol === r.symbol);
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
