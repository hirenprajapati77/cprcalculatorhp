import { NextRequest, NextResponse } from 'next/server';
import { ScannerController } from '@/services/scanner-controller';
import { BreakoutWatcherService } from '@/services/alert/breakout-watcher.service';
import { TelegramService } from '@/services/alert/telegram.service';

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

    // Run the scan synchronously for immediate client feedback
    const results = await ScannerController.runFullScan(universe, market);

    // Fire-and-forget breakout alert — never blocks scan response
    BreakoutWatcherService.detectNewBreakouts(
      results.map(r => ({
        symbol: r.symbol,
        signals: Array.isArray(r.signals) ? r.signals : (r.signalSummary ? r.signalSummary.split(',') : []),
        ltp: r.ltp,
        entry: r.entry ?? r.tc ?? r.ltp,
        sl: r.sl ?? r.bc ?? r.ltp * 0.99,
        target: r.target ?? r.r1 ?? r.ltp * 1.02,
        rr: r.rr ?? '1:1.5',
        score: r.score ?? 0,
        sector: r.sector ?? 'Other',
      }))
    ).then(newBreakouts => {
      if (newBreakouts.length > 0) {
        return TelegramService.sendBreakoutAlert(newBreakouts);
      }
    }).catch(err => {
      console.error('[BreakoutWatcher] Manual scan alert pipeline failed:', err);
    });

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
