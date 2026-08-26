export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { MarketBreadthService } from '@/services/market-tools/market-breadth.service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

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
