import { NextRequest, NextResponse } from 'next/server';
import { TelegramService } from '@/services/alert/telegram.service';
import { BtstService } from '@/services/backtest/btst.service';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');

  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check IST time — only proceed if 15:18-15:25 IST
  const now = new Date();
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const isWeekend = istTime.getDay() === 0 || istTime.getDay() === 6;

  if (isWeekend) {
    return NextResponse.json({ message: 'Market closed on weekends' });
  }

  const timeValue = hours * 100 + minutes;
  if (timeValue < 1518 || timeValue > 1525) {
    return NextResponse.json({ message: `Time ${hours}:${minutes} is outside alert window (15:18-15:25 IST)` });
  }

  try {
    const [nifty50, nseFno] = await Promise.all([
      BtstService.discover('NIFTY50'),
      BtstService.discover('NSE_FNO')
    ]);

    // Merge and deduplicate by symbol
    const merged = [...nifty50, ...nseFno];
    const unique = merged.filter((item, index, self) =>
      index === self.findIndex((t) => t.symbol === item.symbol)
    );

    // Filter to top 5 Long and top 5 Short just for the alert size limit to prevent huge msgs
    const longs = unique.filter(u => u.direction === 'LONG').sort((a, b) => b.score - a.score).slice(0, 5);
    const shorts = unique.filter(u => u.direction === 'SHORT').sort((a, b) => b.score - a.score).slice(0, 5);

    const alertPayload = [...longs, ...shorts];

    await TelegramService.sendBtstAlert(alertPayload);

    return NextResponse.json({ sent: true, count: alertPayload.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
