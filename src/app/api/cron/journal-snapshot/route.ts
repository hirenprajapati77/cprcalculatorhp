import { NextRequest, NextResponse } from 'next/server';
import { TradeJournalService } from '@/services/journal/trade-journal.service';
import { getISTTime } from '@/lib/market-hours';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');
  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  // Determine which snapshot slot based on current IST time
  let slot: '916' | '930' | '945' | '1000' | null = null;
  if      (hour === 9  && minute >= 16 && minute < 20) slot = '916';
  else if (hour === 9  && minute >= 30 && minute < 34) slot = '930';
  else if (hour === 9  && minute >= 45 && minute < 49) slot = '945';
  else if (hour === 10 && minute >= 0  && minute < 4 ) slot = '1000';

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
