import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { ScannerResult, ScanHistory } from '@prisma/client';

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

      const formatted = results.map((r: ScannerResult) => {
        const signals = (r.signalSummary || '')
          .split(/[,\s|]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        const bearish = signals.some((s) =>
          s.includes('BEARISH') || s.includes('SHORT') || s === 'MP_DIRECT_DOWN' || s === 'MP_REVERSAL_DOWN'
        );
        const bullish = signals.some((s) =>
          s.includes('BULLISH') || s.includes('LONG') || s === 'MP_DIRECT_UP' || s === 'BREAKOUT'
        );
        let tag: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
        if (bearish && !bullish) tag = 'SHORT';
        else if (bullish && !bearish) tag = 'LONG';

        return {
          id: r.id,
          date: r.date,
          score: r.score,
          tag,
          signalSummary: r.signalSummary,
          width: r.width,
          ltp: r.ltp,
        };
      });

      return NextResponse.json({
        success: true,
        history: formatted,
      });
    }

    const history = await prisma.scanHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    const formatted = history.map((h: ScanHistory) => ({
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
