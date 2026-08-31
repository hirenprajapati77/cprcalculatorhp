import { NextRequest, NextResponse } from 'next/server';
import { MultiYearBreakoutService, BreakoutWindow } from '@/services/market-tools/multi-year-breakout.service';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const forceRefresh = searchParams.get('refresh') === 'true';

    // B3 fix: ?refresh=true scans 2,636 symbols × multiple year windows.
    // Gate behind auth even though middleware exempts this route for page loads.
    if (forceRefresh && env.APP_ACCESS_TOKEN) {
      const expectedToken = env.APP_ACCESS_TOKEN.trim();
      const authHeader = request.headers.get('authorization');
      const authCookie = request.cookies.get('app_access_token')?.value;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const provided = bearerToken ?? authCookie ?? '';
      if (provided !== expectedToken) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
    }


    const windowFilter = searchParams.get('window') as BreakoutWindow | 'ALL' | null;
    const report = await MultiYearBreakoutService.getBreakoutReport(forceRefresh);

    let filteredStocks = report.stocks;
    if (windowFilter && windowFilter !== 'ALL') {
      filteredStocks = report.stocks.filter((s) => {
        if (windowFilter === '1Y') return s.breakout1Y === true;
        if (windowFilter === '2Y') return s.breakout2Y === true;
        if (windowFilter === '3Y') return s.breakout3Y === true;
        if (windowFilter === '5Y') return s.breakout5Y === true;
        if (windowFilter === '10Y') return s.breakout10Y === true;
        if (windowFilter === 'ATH') return s.breakoutATH === true;
        return true;
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        stocks: filteredStocks,
      },
    });
  } catch (err) {
    console.error('[API:MarketTools:Breakout] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
