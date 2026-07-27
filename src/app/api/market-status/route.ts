import { NextResponse } from 'next/server';
import { getCashSessionState, isMarketOpen } from '@/lib/market-hours';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cashSessionState = getCashSessionState();
  return NextResponse.json({
    cashSessionState,
    isMarketOpen: isMarketOpen(),
  });
}
