import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const symbol = 'BANKNIFTY';
    
    // Parse dates to UTC midnight bounds for July 28, 2026
    const start = new Date('2026-07-28T00:00:00.000Z');
    const end = new Date('2026-07-28T23:59:59.999Z');

    const journal = await prisma.tradeJournal.findMany({
      where: { 
        symbol: symbol, 
        tradeDate: { gte: start, lte: end },
        signalType: 'STBT' 
      }
    });

    const signal = await prisma.overnightSignal.findMany({
      where: {
        symbol: symbol,
        signalDate: '2026-07-28',
        direction: 'STBT'
      }
    });

    return NextResponse.json({ success: true, journal, signal });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
