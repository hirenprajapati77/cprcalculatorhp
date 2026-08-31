export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { MarketBreadthService } from '@/services/market-tools/market-breadth.service';
import { env } from '@/config/env';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    // B2 fix: ?refresh=true triggers an expensive full DB scan. Gate it behind
    // auth even though the route is middleware-exempted (middleware exemption is
    // needed so the page can load unauthenticated; it should NOT allow DDoS).
    if (refresh && env.APP_ACCESS_TOKEN) {
      const expectedToken = env.APP_ACCESS_TOKEN.trim();
      const authHeader = request.headers.get('authorization');
      const authCookie = request.cookies.get('app_access_token')?.value;
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const provided = bearerToken ?? authCookie ?? '';
      if (provided !== expectedToken) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
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
