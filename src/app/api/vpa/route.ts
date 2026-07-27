import { NextRequest, NextResponse } from 'next/server';
import { MarketService } from '@/services/market.service';
import { calculateCPR } from '@/lib/cpr-engine';
import { getAtrPct } from '@/lib/atr';
import { getCompletedHistory } from '@/lib/market-hours';
import { VpaConfirmationService, buildVpaInputs } from '@/services/vpa';
import { publicApiError } from '@/lib/api-error';

export const dynamic = 'force-dynamic';

/** On-demand VPA confirmation for a single symbol (drawer lazy-load). */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol')?.trim();
    const direction = searchParams.get('direction') === 'SHORT' ? 'SHORT' : 'LONG';

    if (!symbol || symbol.length > 32) {
      return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }

    const stock = await MarketService.getStockData(symbol);
    if (!stock) {
      return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
    }

    const completed = getCompletedHistory(stock.history || []);
    if (completed.length < 1) {
      return NextResponse.json({ error: 'Insufficient history' }, { status: 422 });
    }

    const atrPct = getAtrPct(completed, stock.close);
    const yesterday =
      completed.length >= 2 ? completed[completed.length - 2] : completed[completed.length - 1];
    const todayCpr = calculateCPR(
      { high: yesterday.high, low: yesterday.low, close: yesterday.close },
      atrPct
    );

    const inputs = buildVpaInputs(
      direction,
      {
        open: stock.open,
        high: stock.high,
        low: stock.low,
        close: stock.ltp,
        volume: stock.volume,
        avgVolume: stock.avgVolume,
      },
      { bc: todayCpr.bc, tc: todayCpr.tc }
    );

    if (!inputs) {
      return NextResponse.json({ error: 'Invalid OHLC for VPA' }, { status: 422 });
    }

    const vpa = VpaConfirmationService.analyze(inputs);
    return NextResponse.json({ success: true, vpa });
  } catch (err) {
    console.error('[VPA GET]', err);
    return NextResponse.json({ error: publicApiError(err) }, { status: 500 });
  }
}
