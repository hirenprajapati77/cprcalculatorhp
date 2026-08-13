import { NextRequest, NextResponse } from 'next/server';
import { ScannerController, isScanInProgress } from '@/services/scanner-controller';
import { isUniverseLiveForScanner, type ScannerUniverse } from '@/lib/scanner-session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const universe = (body.universe || 'NIFTY50') as ScannerUniverse;
    const market = body.market || 'NSE';

    if (!['NIFTY50', 'NIFTY200', 'NIFTY_FNO', 'ALL'].includes(universe)) {
      return NextResponse.json({ error: 'Invalid universe parameter' }, { status: 400 });
    }
    if (!['NSE', 'BSE'].includes(market)) {
      return NextResponse.json({ error: 'Invalid market parameter' }, { status: 400 });
    }

    const bypass = body.bypass === true;
    const marketOpen = isUniverseLiveForScanner(universe);

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

    // Do not queue a second full scan while cron/UI refresh is already running.
    if (isScanInProgress()) {
      return NextResponse.json({
        success: true,
        inProgress: true,
        message: 'Scan already in progress. Poll GET /api/scanner for updated rows.',
      }, { status: 202 });
    }

    // Kick off without blocking the HTTP response. A NIFTY_FNO scan on the 1 GB VM
    // can take 40–100s+ (Fyers 429 cooldown made one run 315s). The Scan button
    // must not spin until that finishes — UI polls GET /api/scanner (warm cache).
    // Telegram breakout alerts stay cron-only (cpr-scan job + /api/cron/auto-scan).
    void ScannerController.runFullScan(universe, market).catch((err) => {
      console.error('[ScannerRefresh] background scan failed:', err);
    });

    return NextResponse.json({
      success: true,
      inProgress: true,
      started: true,
      message: 'Scan started. Poll GET /api/scanner for updated rows.',
    }, { status: 202 });
  } catch (err) {
    console.error('Error in scanner refresh API route:', err);
    return NextResponse.json(
      { error: 'Internal server error occurred while refreshing scanner' },
      { status: 500 }
    );
  }
}
