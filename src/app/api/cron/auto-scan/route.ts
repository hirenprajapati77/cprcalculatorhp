import { NextRequest, NextResponse } from 'next/server';
import { ScannerController } from '@/services/scanner-controller';
import { CacheService } from '@/services/cache.service';
import { BreakoutWatcherService } from '@/services/alert/breakout-watcher.service';
import { TelegramService } from '@/services/alert/telegram.service';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');

  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const universe = searchParams.get('universe') || 'NIFTY_FNO';

  // Check IST time
  const now = new Date();
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const isWeekend = istTime.getDay() === 0 || istTime.getDay() === 6;
  const timeValue = hours * 100 + minutes;

  // Between 9:15 and 15:30 IST only (Market Hours)
  if (isWeekend || timeValue < 915 || timeValue > 1530) {
    return NextResponse.json({ message: 'Market closed, skipping auto-scan' });
  }

  try {
    const results = await ScannerController.runFullScan(universe as "NIFTY50" | "NIFTY100" | "NIFTY200" | "NSE_FNO" | "NIFTY_FNO" | "ALL_NSE" | "ALL" | "Auto" | "WATCHLIST", 'NSE');

    await CacheService.set('AUTO_SCAN_RESULT', {
      data: results,
      timestamp: new Date().toISOString()
    }, 60 * 60); // cache for 1 hour

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
      console.error('[BreakoutWatcher] Auto-scan alert pipeline failed:', err);
    });

    return NextResponse.json({ success: true, count: results.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
