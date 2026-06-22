import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';
import { BtstService } from '@/services/backtest/btst.service';
import { getISTTime } from '@/lib/market-hours';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');

  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check IST time — only proceed if 15:15-23:59 IST
  const { hour, minute, isWeekend } = getISTTime();

  if (isWeekend) {
    return NextResponse.json({ message: 'Market closed on weekends' });
  }

  const timeValue = hour * 100 + minute;
  if (timeValue < 1515 || timeValue > 2359) {
    return NextResponse.json({ message: `Time ${hour}:${minute} is outside alert window (15:15-23:59 IST)` });
  }

  try {
    const [nifty50, nseFno] = await Promise.all([
      BtstService.discover('NIFTY50'),
      BtstService.discover('NSE_FNO')
    ]);

    // Merge and deduplicate by symbol
    const merged = [...nifty50.results, ...nseFno.results];
    const unique = merged.filter((item, index, self) =>
      index === self.findIndex((t) => t.symbol === item.symbol)
    );

    // Filter to top 5 Long and top 5 Short just for the alert size limit to prevent huge msgs
    const longs = unique.filter(u => u.tag === 'LONG').sort((a, b) => Math.max(b.longScore, b.shortScore) - Math.max(a.longScore, a.shortScore)).slice(0, 5);
    const shorts = unique.filter(u => u.tag === 'SHORT').sort((a, b) => Math.max(b.longScore, b.shortScore) - Math.max(a.longScore, a.shortScore)).slice(0, 5);

    const alertPayload = [...longs, ...shorts];

    await TelegramService.sendBtstAlert(alertPayload);

    return NextResponse.json({ sent: true, count: alertPayload.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
