import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const direction = searchParams.get('direction');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const whereClause: Record<string, unknown> = {
      signalDate: date
    };

    if (direction && direction !== 'BOTH') {
      whereClause.direction = direction;
    }

    if (activeOnly) {
      whereClause.classification = {
        in: ['STRONG_BTST', 'BTST_READY', 'STRONG_STBT', 'STBT_READY', 'WATCH']
      };
    }

    const signals = await prisma.overnightSignal.findMany({
      where: whereClause,
      orderBy: [
        { overnightScore: 'desc' }
      ]
    });

    return NextResponse.json(signals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
