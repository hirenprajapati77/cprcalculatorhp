import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');

  if (!runId) {
    return NextResponse.json({ error: 'runId is required' }, { status: 400 });
  }

  try {
    const run = await prisma.backtestRun.findUnique({ where: { id: runId } });
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const trades = await prisma.trade.findMany({
      where: { backtestRunId: runId },
      orderBy: { entryDate: 'asc' }
    });

    const equityCurve: any[] = [];
    const monthlyPnlMap: Record<string, { pnl: number; tradeCount: number }> = {};
    const drawdown: any[] = [];
    const signalMap: Record<string, { wins: number; losses: number; totalPnl: number }> = {};
    const distributionMap: Record<string, number> = {};

    let cumulativePnl = 0;
    let peakEquity = run.capital;

    for (const trade of trades) {
      if (trade.pnl === null) continue;

      cumulativePnl += trade.pnl;
      const currentEquity = run.capital + cumulativePnl;
      
      if (currentEquity > peakEquity) {
        peakEquity = currentEquity;
      }

      const drawdownPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;

      // Ensure we format date correctly, handle optional exitDate
      const tradeDate = (trade.exitDate || trade.entryDate).toISOString();

      equityCurve.push({
        date: tradeDate,
        cumulativePnl
      });

      drawdown.push({
        date: tradeDate,
        drawdownPct: -drawdownPct, // negative for visual
        peakEquity
      });

      // Monthly
      const dateObj = new Date(tradeDate);
      const monthYear = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyPnlMap[monthYear]) {
        monthlyPnlMap[monthYear] = { pnl: 0, tradeCount: 0 };
      }
      monthlyPnlMap[monthYear].pnl += trade.pnl;
      monthlyPnlMap[monthYear].tradeCount += 1;

      // Signal Breakdown
      // Safe to use directly since backtest now stores a stable key (e.g. NARROW_CPR_BULLISH)
      const baseSignal = trade.signal;
      if (!signalMap[baseSignal]) {
        signalMap[baseSignal] = { wins: 0, losses: 0, totalPnl: 0 };
      }
      if (trade.pnl > 0) signalMap[baseSignal].wins++;
      else signalMap[baseSignal].losses++;
      signalMap[baseSignal].totalPnl += trade.pnl;

      // Trade Distribution
      // Group PnL in buckets of 500
      const bucketSize = 500;
      const bucketKey = Math.floor(trade.pnl / bucketSize) * bucketSize;
      distributionMap[bucketKey] = (distributionMap[bucketKey] || 0) + 1;
    }

    const monthlyPnl = Object.keys(monthlyPnlMap).sort().map(key => {
      const [year, month] = key.split('-');
      return {
        month: new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', { month: 'short' }),
        year: Number(year),
        pnl: monthlyPnlMap[key].pnl,
        tradeCount: monthlyPnlMap[key].tradeCount
      };
    });

    const signalBreakdown = Object.keys(signalMap).map(signal => {
      const { wins, losses, totalPnl } = signalMap[signal];
      const total = wins + losses;
      return {
        signal,
        wins,
        losses,
        winRate: total > 0 ? (wins / total) * 100 : 0,
        avgPnl: total > 0 ? totalPnl / total : 0
      };
    });

    const tradeDistribution = Object.keys(distributionMap)
      .map(Number)
      .sort((a, b) => a - b)
      .map(bucket => ({
        bucket: `${bucket} to ${bucket + 500}`,
        count: distributionMap[bucket],
        minPnl: bucket,
        maxPnl: bucket + 500
      }));

    return NextResponse.json({
      equityCurve,
      monthlyPnl,
      drawdown,
      signalBreakdown,
      tradeDistribution
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
