import { NextResponse } from 'next/server';
import { getCashSessionState, getSessionState, isMarketOpen } from '@/lib/market-hours';
import { getActiveMarketProfile } from '@/config/market-profile';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cashSessionState = getCashSessionState();
  const profile = getActiveMarketProfile();
  return NextResponse.json({
    cashSessionState,
    isMarketOpen: isMarketOpen(),
    marketProfile: profile.id,
    sessionState: getSessionState(),
  });
}
