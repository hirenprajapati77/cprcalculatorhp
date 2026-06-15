import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const signals = await prisma.btstSignal.findMany({
      where: {
        signalDate: date,
        classification: {
          in: ['STRONG_BTST', 'BTST_READY']
        }
      },
      orderBy: {
        btstScore: 'desc'
      }
    });

    return NextResponse.json(signals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
