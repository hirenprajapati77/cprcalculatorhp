import { NextRequest, NextResponse } from 'next/server';
import { BacktestService } from '@/services/backtest/backtest.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await BacktestService.submitRun(body);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    take: 20
  });

  return NextResponse.json(runs);
}
