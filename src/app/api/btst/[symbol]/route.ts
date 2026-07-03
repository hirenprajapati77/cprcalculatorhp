import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { MarketService } from '@/services/market.service';
import { OvernightRiskService } from '@/services/overnight/overnight-risk.service';

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
      where: { symbol, direction: 'LONG' },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const activeSignal = history.length > 0 ? history[0] : null;

    const stock = await MarketService.getStockData(symbol);
    let risk = null;
    if (stock) {
      risk = OvernightRiskService.calculateOvernightRisk(stock);
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
