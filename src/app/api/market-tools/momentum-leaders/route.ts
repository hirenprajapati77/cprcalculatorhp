import { NextRequest, NextResponse } from 'next/server';
import { MomentumLeadersService, MomentumTier, MomentumUniverse } from '@/services/market-tools/momentum-leaders.service';
import { isAuthorizedForRefresh } from '@/lib/market-tools-refresh-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Gate heavy refresh behind auth — prevents unauthenticated DDoS of the DB scan
    if (forceRefresh && !(await isAuthorizedForRefresh(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const universeParam = searchParams.get('universe');
    const universe: MomentumUniverse = universeParam === 'ALL_NSE' ? 'ALL_NSE' : 'NSE_FNO';
    const tierFilter = searchParams.get('tier') as MomentumTier | 'ALL' | null;
    const windowLeaderFilter = searchParams.get('windows') as '4' | '3' | '2' | '1' | 'ALL' | null;
    const sectorFilter = searchParams.get('sector');

    const report = await MomentumLeadersService.getMomentumLeadersReport(forceRefresh, universe);

    let filteredStocks = report.allStocks;

    if (tierFilter && tierFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter(s => s.tier === tierFilter);
    }

    if (windowLeaderFilter && windowLeaderFilter !== 'ALL') {
      const minWindows = parseInt(windowLeaderFilter, 10);
      filteredStocks = filteredStocks.filter(s => s.leaderWindowCount >= minWindows);
    }

    if (sectorFilter && sectorFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter(s => s.sector === sectorFilter);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        allStocks: filteredStocks,
      },
    });
  } catch (err) {
    console.error('[API:MarketTools:MomentumLeaders] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}