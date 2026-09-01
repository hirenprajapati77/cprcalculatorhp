export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { MarketBreadthService } from '@/services/market-tools/market-breadth.service';
import { isAuthorizedForRefresh } from '@/lib/market-tools-refresh-auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    // B2 fix: ?refresh=true triggers an expensive full DB scan. Gate it behind
    // auth even though the route is middleware-exempted (middleware exemption is
    // needed so the page can load unauthenticated; it should NOT allow DDoS).
    if (refresh && !(await isAuthorizedForRefresh(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const breadthReport = await MarketBreadthService.getMarketBreadth(refresh);
    return NextResponse.json({
      success: true,
      data: breadthReport,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: msg,
      },
      { status: 500 }
    );
  }
}
