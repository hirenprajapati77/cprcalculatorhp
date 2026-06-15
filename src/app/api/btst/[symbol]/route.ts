import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { MarketService } from '@/services/market.service';
import { OvernightRiskService } from '@/services/btst/overnight-risk.service';

const prisma = new PrismaClient();

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
    // 1. Fetch signal history
    const history = await prisma.btstSignal.findMany({
      where: { symbol },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const activeSignal = history.length > 0 ? history[0] : null;

    // 2. Fetch live stock data to compute current overnight risk
    const stock = await MarketService.getStockData(symbol);
    let risk = null;
    if (stock) {
      risk = OvernightRiskService.calculateOvernightRisk(stock);
    }

    return NextResponse.json({
      symbol,
      signal: activeSignal,
      entry: activeSignal ? {
        entry: activeSignal.entry,
        stopLoss: activeSignal.stopLoss,
        target: activeSignal.target,
        confidence: activeSignal.confidence,
        exitStrategy: activeSignal.exitStrategy,
        state: activeSignal.state
      } : null,
      risk,
      history
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
