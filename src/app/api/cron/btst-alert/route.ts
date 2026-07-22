import { NextRequest, NextResponse } from 'next/server';
import { isBtstDiscoveryOpen, getISTTime, BTST_CLOCK } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { runBtstAlertJob } from '@/services/scheduler/btst-alert.job';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  if (!isBtstDiscoveryOpen()) {
    const { hour, minute } = getISTTime();
    return NextResponse.json({
      message: `Time ${hour}:${String(minute).padStart(2, '0')} is outside alert window (${BTST_CLOCK.discoveryStart}–${BTST_CLOCK.discoveryEnd} IST)`,
    });
  }

  try {
    const result = await runBtstAlertJob();
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
