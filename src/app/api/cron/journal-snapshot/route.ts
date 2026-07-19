import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  const bypassWindow = env.NODE_ENV !== 'production' &&
                       req.nextUrl.searchParams.get('bypassWindow') === 'true';

  // Determine which snapshot slot based on current IST time
  let slot: '916' | '930' | '945' | '1000' | null = null;
  if (bypassWindow) {
    // Manual backfill: pick nearest slot based on current time
    if (hour < 9 || (hour === 9 && minute < 23)) slot = '916';
    else if (hour === 9 && minute < 38) slot = '930';
    else if (hour === 9 && minute < 53) slot = '945';
    else slot = '1000';
  } else {
    // existing exact window logic
    if      (hour === 9  && minute >= 16 && minute < 20) slot = '916';
    else if (hour === 9  && minute >= 30 && minute < 34) slot = '930';
    else if (hour === 9  && minute >= 45 && minute < 49) slot = '945';
    else if (hour === 10 && minute >= 0  && minute < 4 ) slot = '1000';
  }

  if (!slot) {
    return NextResponse.json({
      message: `No snapshot scheduled at IST ${hour}:${String(minute).padStart(2, '0')}`
    });
  }

  await TradeJournalService.captureSnapshot(slot);

  return NextResponse.json({
    success: true,
    slot,
    istTime: `${hour}:${String(minute).padStart(2, '0')}`
  });
}
