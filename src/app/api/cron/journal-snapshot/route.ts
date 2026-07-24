import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import {
  resolveJournalSnapshotSlot,
  runJournalSnapshotJob,
  type JournalSnapshotSlot,
} from '@/services/scheduler/journal-snapshot.job';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  const bypassWindow =
    env.NODE_ENV !== 'production' && req.nextUrl.searchParams.get('bypassWindow') === 'true';

  let slot: JournalSnapshotSlot | null = null;
  if (bypassWindow) {
    if (hour < 9 || (hour === 9 && minute < 23)) slot = '916';
    else if (hour === 9 && minute < 38) slot = '930';
    else slot = '945';
  } else {
    slot = resolveJournalSnapshotSlot();
  }

  if (!slot) {
    return NextResponse.json({
      message: `No snapshot scheduled at IST ${hour}:${String(minute).padStart(2, '0')}`,
    });
  }

  const result = await runJournalSnapshotJob(slot);

  return NextResponse.json({
    ...result,
    istTime: `${hour}:${String(minute).padStart(2, '0')}`,
  });
}
