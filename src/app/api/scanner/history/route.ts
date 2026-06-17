import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');

    if (symbol) {
      const results = await prisma.scannerResult.findMany({
        where: { symbol },
        orderBy: { date: 'desc' },
        take: 10,
      });

      const formatted = results.map(r => ({
        id: r.id,
        date: r.date,
        score: r.score,
        tag: r.score >= 70 ? 'LONG' : r.score <= 30 ? 'SHORT' : 'NEUTRAL',
        signalSummary: r.signalSummary,
        width: r.width,
        ltp: r.ltp,
      }));

      return NextResponse.json({
        success: true,
        history: formatted,
      });
    }

    const history = await prisma.scanHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const formatted = history.map((h) => ({
      ...h,
      filters: h.filtersJson ? JSON.parse(h.filtersJson) : {},
    }));

    return NextResponse.json({
      success: true,
      results: formatted,
    }, { status: 200 });
  } catch (err) {
    console.error('Error fetching scan history:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching scan history' },
      { status: 500 }
    );
  }
}
