import { NextRequest, NextResponse } from 'next/server';
import { PatternBreakoutService, PatternType, BreakoutStatus } from '@/services/market-tools/pattern-breakout.service';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Gate heavy refresh behind auth — prevents unauthenticated DDoS of the DB scan
    if (forceRefresh && env.APP_ACCESS_TOKEN) {
      const expectedToken = env.APP_ACCESS_TOKEN.trim();
      const expectedHash = await hashToken(expectedToken);
      const authHeader = request.headers.get('authorization');
      const authCookie = request.cookies.get('app_access_token')?.value;
      const isAuth =
        (authHeader && timingSafeEqual(authHeader, `Bearer ${expectedToken}`)) ||
        (authCookie && (timingSafeEqual(authCookie, expectedHash) || timingSafeEqual(authCookie, expectedToken)));
      if (!isAuth) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const patternFilter = searchParams.get('pattern') as PatternType | 'ALL' | null;
    const statusFilter = searchParams.get('status') as BreakoutStatus | 'ALL' | null;
    const tierFilter = searchParams.get('tier') as 'A+' | 'A' | 'B' | 'C' | 'ALL' | null;

    const report = await PatternBreakoutService.getPatternBreakoutReport(forceRefresh);

    let filteredStocks = report.stocks;
    if (patternFilter && patternFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter(s => s.primaryPattern === patternFilter);
    }
    if (statusFilter && statusFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter(s => s.status === statusFilter);
    }
    if (tierFilter && tierFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter(s => s.scoreBreakdown.qualityTier === tierFilter);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        stocks: filteredStocks,
      },
    });
  } catch (err) {
    console.error('[API:MarketTools:PatternBreakout] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
