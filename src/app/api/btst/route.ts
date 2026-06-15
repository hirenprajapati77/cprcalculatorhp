import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('activeOnly') === 'true';
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const whereClause: Record<string, unknown> = {
      signalDate: date
    };

    if (activeOnly) {
      whereClause.classification = {
        in: ['STRONG_BTST', 'BTST_READY', 'WATCH']
      };
      whereClause.state = 'ACTIVE';
    }

    const signals = await prisma.btstSignal.findMany({
      where: whereClause,
      orderBy: [
        { btstScore: 'desc' }
      ]
    });

    return NextResponse.json(signals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { symbol, signalDate, signalTime, classification, state } = body;

    if (!symbol || !signalDate || !signalTime) {
      return NextResponse.json({ error: 'Missing required keys (symbol, signalDate, signalTime)' }, { status: 400 });
    }

    const signal = await prisma.btstSignal.upsert({
      where: {
        symbol_signalDate_signalTime: {
          symbol,
          signalDate,
          signalTime
        }
      },
      update: body,
      create: {
        ...body,
        classification: classification || 'IGNORE',
        state: state || 'DISCOVERING'
      }
    });

    return NextResponse.json(signal);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
