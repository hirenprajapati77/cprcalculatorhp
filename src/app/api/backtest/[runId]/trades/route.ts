import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const skip = (page - 1) * limit;

  try {
    const { runId } = await params;
    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where: { backtestRunId: runId },
        skip,
        take: limit,
        orderBy: { entryDate: 'asc' },
        select: {
          id: true, symbol: true, type: true, signal: true, status: true,
          entryDate: true, entryPrice: true, exitDate: true, exitPrice: true,
          pnl: true, pnlPercent: true, durationDays: true, rr: true
        }
      }),
      prisma.trade.count({ where: { backtestRunId: runId } })
    ]);

    return NextResponse.json({
      trades,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
