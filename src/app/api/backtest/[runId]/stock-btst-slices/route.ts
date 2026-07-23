import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computeStockBtstSliceMetrics } from '@/services/backtest/stock-btst-slice-metrics';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const run = await prisma.backtestRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const trades = await prisma.trade.findMany({
      where: { backtestRunId: runId, strategyMode: 'BTST_STBT_DRIVEN' },
      orderBy: { entryDate: 'asc' },
    });

    const slices =
      trades.length > 0
        ? computeStockBtstSliceMetrics(trades)
        : { byRegime: {}, byVduBand: {}, byScoreBand: {}, byDirection: {} };

    return NextResponse.json({
      success: true,
      strategyMode: run.strategyMode,
      tradeCount: trades.length,
      slices,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
