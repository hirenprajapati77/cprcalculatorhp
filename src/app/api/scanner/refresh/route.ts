import { NextRequest, NextResponse } from 'next/server';
import { ScannerController } from '@/services/scanner-controller';
import { isMarketOpen } from '@/lib/market-hours';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const universe = body.universe || 'NIFTY50';
    const market = body.market || 'NSE';

    if (!['NIFTY50', 'NIFTY200', 'NIFTY_FNO', 'ALL'].includes(universe)) {
      return NextResponse.json({ error: 'Invalid universe parameter' }, { status: 400 });
    }
    if (!['NSE', 'BSE'].includes(market)) {
      return NextResponse.json({ error: 'Invalid market parameter' }, { status: 400 });
    }

    const bypass = body.bypass === true;
    const marketOpen = isMarketOpen();

    if (!marketOpen && !bypass) {
      // Outside live cash session: return frozen database results from the latest completed session
      const { prisma } = await import('@/lib/db');
      const latestRecord = await prisma.scannerResult.findFirst({
        orderBy: { date: 'desc' },
        select: { date: true },
      });
      const targetDate = latestRecord?.date;
      const existingResults = targetDate ? await prisma.scannerResult.findMany({
        where: { date: targetDate },
        orderBy: { score: 'desc' },
      }) : [];

      return NextResponse.json({
        success: true,
        message: 'Market is closed (09:15–15:30 IST). Showing frozen scan results from the last session.',
        isMarketOpen: false,
        count: existingResults.length,
        results: existingResults,
      }, { status: 200 });
    }

    // UI / page-load refresh: recompute scanner data only.
    // Telegram breakout alerts are cron-only (cpr-scan job + /api/cron/auto-scan).
    const results = await ScannerController.runFullScan(universe, market);

    return NextResponse.json({
      success: true,
      message: 'Scanner refresh completed.',
      count: results.length,
      results,
    }, { status: 200 });
  } catch (err) {
    console.error('Error in scanner refresh API route:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while refreshing scanner' },
      { status: 500 }
    );
  }
}
