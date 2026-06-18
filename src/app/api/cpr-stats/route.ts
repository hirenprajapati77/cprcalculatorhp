import { NextRequest, NextResponse } from 'next/server';
import { CprStatsService } from '@/services/cpr-stats.service';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol');
  const lookbackRaw = searchParams.get('lookback');

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const lookback = lookbackRaw ? parseInt(lookbackRaw, 10) : 90;
  if (![90, 180, 365].includes(lookback)) {
    return NextResponse.json({ error: 'lookback must be 90, 180, or 365' }, { status: 400 });
  }

  try {
    const stats = await CprStatsService.getWidthStats(symbol, lookback as 90 | 180 | 365);
    return NextResponse.json(stats);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
