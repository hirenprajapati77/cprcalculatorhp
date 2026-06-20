import { NextRequest, NextResponse } from 'next/server';
import { BreakoutWatcherService } from '@/services/alert/breakout-watcher.service';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');

  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await BreakoutWatcherService.resetDailyState();
    return NextResponse.json({ reset: true, resetAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
