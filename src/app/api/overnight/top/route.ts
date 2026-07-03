import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const signals = await prisma.overnightSignal.findMany({
      where: {
        signalDate: date,
        classification: {
          in: ['STRONG_BTST', 'STRONG_STBT']
        }
      },
      orderBy: {
        overnightScore: 'desc'
      }
    });

    return NextResponse.json(signals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
