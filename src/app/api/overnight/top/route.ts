import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getISTDateString } from '@/lib/market-hours';
import { STOCK_OVERNIGHT_INSTRUMENT_WHERE } from '@/lib/overnight-instrument-filter';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawDate = searchParams.get('date');
    if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
    }
    const date = rawDate || getISTDateString();

    const signals = await prisma.overnightSignal.findMany({
      where: {
        signalDate: date,
        qualityBucket: 'TRADEABLE',
        classification: {
          in: ['STRONG_BTST', 'STRONG_STBT']
        },
        ...STOCK_OVERNIGHT_INSTRUMENT_WHERE,
      },
      take: 50,
      orderBy: [
        { signalTime: 'desc' },
        { overnightScore: 'desc' },
      ]
    });

    return NextResponse.json(signals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
