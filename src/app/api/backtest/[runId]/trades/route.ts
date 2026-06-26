import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: { runId: string } }) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const skip = (page - 1) * limit;

  try {
    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where: { backtestRunId: params.runId },
        skip,
        take: limit,
        orderBy: { entryDate: 'asc' },
        select: {
          id: true, symbol: true, type: true, signal: true, status: true,
          entryDate: true, entryPrice: true, exitDate: true, exitPrice: true,
          pnl: true, pnlPercent: true, durationDays: true, rr: true
        }
      }),
      prisma.trade.count({ where: { backtestRunId: params.runId } })
    ]);

    return NextResponse.json({
      trades,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
