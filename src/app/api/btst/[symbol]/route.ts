import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { MarketService } from '@/services/market.service';
import { OvernightRiskService } from '@/services/overnight/overnight-risk.service';
import { STOCK_OVERNIGHT_INSTRUMENT_WHERE } from '@/lib/overnight-instrument-filter';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ symbol: string }> }
) {
  const params = await props.params;
  const symbol = params.symbol;

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter is required' }, { status: 400 });
  }

  try {
    const history = await prisma.overnightSignal.findMany({
      where: { symbol, direction: 'LONG', ...STOCK_OVERNIGHT_INSTRUMENT_WHERE },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const activeSignal = history.length > 0 ? history[0] : null;

    const stock = await MarketService.getStockData(symbol);
    let risk: Omit<
      ReturnType<typeof OvernightRiskService.calculateOvernightRisk>,
      'indexCorrelationEstimate'
    > | null = null;
    if (stock) {
      // indexCorrelationEstimate is a placeholder (always null until real NIFTY-covariance
      // data is wired in) and is explicitly not meant to reach clients — see the comment on
      // OvernightRiskMetrics in overnight-risk.service.ts.
      const { indexCorrelationEstimate: _unused, ...publicRisk } =
        OvernightRiskService.calculateOvernightRisk(stock);
      risk = publicRisk;
    }

    return NextResponse.json({
      symbol,
      signal: activeSignal,
      entry: activeSignal ? {
        direction: activeSignal.direction,
        entry: activeSignal.entry,
        stopLoss: activeSignal.stopLoss,
        target: activeSignal.target,
        confidence: activeSignal.confidence,
        exitStrategy: activeSignal.exitStrategy,
      } : null,
      risk,
      history
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
