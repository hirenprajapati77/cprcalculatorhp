import { NextRequest, NextResponse } from 'next/server';
import { MarketService } from '@/services/market.service';
import { isValidCronSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');

  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const universe = searchParams.get('universe') || 'NIFTY_FNO';

  // Intentionally skipping isTradingDay check to allow weekend bridging
  // Yahoo Finance returns Friday's close on weekends, so running this on Sat/Sun
  // keeps the 24h TTL fresh through to Monday morning.

  try {
    const result = await MarketService.cache200SMA(universe as 'NIFTY50' | 'NIFTY100' | 'NIFTY200' | 'NSE_FNO' | 'NIFTY_FNO' | 'ALL_NSE' | 'ALL' | 'Auto' | 'WATCHLIST');
    return NextResponse.json({ success: true, cachedCount: result.success, failedCount: result.failed });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
