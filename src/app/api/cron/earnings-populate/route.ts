import { NextResponse } from 'next/server';
import { isValidCronSecret } from '@/lib/crypto';
import { EarningsPopulatorService } from '@/services/earnings-populator.service';
import { getISTTime } from '@/lib/market-hours';
import { tryClaimCronRun, completeCronRun, releaseCronRun } from '@/services/scheduler/cron-run-claim';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300; // Allow ample time for fallback Yahoo Finance batch calls

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('x-cron-secret');
    if (!isValidCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { dateString } = getISTTime();
    const claimKey = `earnings-populate:${dateString}`;

    if (!(await tryClaimCronRun(claimKey))) {
      return NextResponse.json({ skipped: true, reason: 'already run or in progress' });
    }

    try {
      const result = await EarningsPopulatorService.populate();

      if (!result.success) {
        await releaseCronRun(claimKey);
        return NextResponse.json({ 
          error: 'Populator partially failed', 
          details: result 
        }, { status: 500 });
      }

      await completeCronRun(claimKey, true);
      return NextResponse.json(result);
    } catch (innerError) {
      await releaseCronRun(claimKey);
      throw innerError;
    }
  } catch (error: unknown) {
    console.error('Earnings Populator Cron Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}
