import { NextRequest, NextResponse } from 'next/server';
import { getISTTime } from '@/lib/market-hours';
import { isValidCronSecret } from '@/lib/crypto';
import { CPR_JOURNAL_WINDOW } from '@/config/trading-constants';
import { runCprJournalJob } from '@/services/scheduler/cpr-journal.job';
import { tryClaimCronRun, completeCronRun, releaseCronRun } from '@/services/scheduler/cron-run-claim';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('x-cron-secret');
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, isTradingDay, dateString } = getISTTime();

  if (!isTradingDay) {
    return NextResponse.json({ message: 'Market closed today (Weekend or Holiday)' });
  }

  const timeValue = hour * 100 + minute;
  if (timeValue < CPR_JOURNAL_WINDOW.START_HHMM || timeValue > CPR_JOURNAL_WINDOW.END_HHMM) {
    return NextResponse.json({
      message: `CPR journal cron outside window at IST ${hour}:${String(minute).padStart(2, '0')}`,
    });
  }

  const claimKey = `cpr-journal:${dateString}`;
  if (!(await tryClaimCronRun(claimKey))) {
    return NextResponse.json({ skipped: true, reason: 'already run or in progress' });
  }

  try {
    const result = await runCprJournalJob();
    const isNoSignals =
      !result.success &&
      typeof result.message === 'string' &&
      /no cpr signals/i.test(result.message);

    if (result.success || isNoSignals) {
      await completeCronRun(claimKey, true);
    } else {
      await releaseCronRun(claimKey);
    }

    if (result.message && result.logged.length === 0) {
      return NextResponse.json({ message: result.message });
    }
    return NextResponse.json(result);
  } catch (err) {
    await releaseCronRun(claimKey);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
