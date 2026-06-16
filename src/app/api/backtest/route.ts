import { NextRequest, NextResponse } from 'next/server';
import { BacktestService } from '@/services/backtest/backtest.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await BacktestService.submitRun(body);
    
    if (result.status === 'UNAVAILABLE') {
      return NextResponse.json({ feature: 'backtest', status: 'unavailable' }, { status: 503 });
    }
    
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');

  if (runId) {
    const run = await prisma.backtestRun.findUnique({
      where: { id: runId },
      include: { metrics: true }
    });
    return NextResponse.json(run);
  }

  const runs = await prisma.backtestRun.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      metrics: true,
      _count: {
        select: { trades: true }
      }
    },
    take: 20
  });

  return NextResponse.json(runs);
}
