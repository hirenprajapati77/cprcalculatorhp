import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sanitizePagination } from '@/lib/pagination';

export async function GET(req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    if (!runId || !/^[a-zA-Z0-9_-]{1,64}$/.test(runId)) {
      return NextResponse.json({ error: 'Invalid runId' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const { page, limit } = sanitizePagination(searchParams.get('page'), searchParams.get('limit'), 200, 50);
    const skip = (page - 1) * limit;

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
