import { NextRequest, NextResponse } from 'next/server';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { CPR_JOURNAL_WINDOW } from '@/config/trading-constants';
import { runCprJournalJob } from '@/services/scheduler/cpr-journal.job';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, isTradingDay } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  const timeValue = hour * 100 + minute;
  if (timeValue < CPR_JOURNAL_WINDOW.START_HHMM || timeValue > CPR_JOURNAL_WINDOW.END_HHMM) {
    return NextResponse.json({
      message: `CPR journal cron outside window at IST ${hour}:${String(minute).padStart(2, '0')}`,
    });
  }

  try {
    const result = await runCprJournalJob();
    if (result.message && result.logged.length === 0) {
      return NextResponse.json({ message: result.message });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
