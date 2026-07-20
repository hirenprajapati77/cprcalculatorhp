import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getISTDateString } from '@/lib/market-hours';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || getISTDateString();

    const signals = await prisma.overnightSignal.findMany({
      where: {
        signalDate: date,
        direction: 'LONG',
        qualityBucket: 'TRADEABLE',
        classification: {
          in: ['STRONG_BTST', 'BTST_READY']
        }
      },
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
