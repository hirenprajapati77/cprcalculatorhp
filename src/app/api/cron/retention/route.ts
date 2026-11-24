import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { RetentionService } from '@/services/retention/retention.service';
import { VolumeTelemetryService } from '@/services/retention/volume-telemetry.service';
import { isValidCronSecret } from '@/lib/crypto';

export type RetentionStepName = 'markExpired' | 'purgeExpired' | 'volumeTelemetryPurge';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('x-cron-secret');
  
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === 'true' || env.RETENTION_DRY_RUN === 'true';
  const limitStr = searchParams.get('limit') || env.RETENTION_LIMIT?.toString() || '250';
  const rawLimit = parseInt(limitStr, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 250;

  // Strictly validated catch-up telemetry max rows parameter (min 1,000, max 100,000, default 25,000)
  const telemetryMaxRowsStr = searchParams.get('telemetryMaxRows');
  let telemetryMaxRows = 25000;
  if (telemetryMaxRowsStr !== null) {
    if (!/^\d+$/.test(telemetryMaxRowsStr)) {
      return NextResponse.json(
        { error: 'Invalid telemetryMaxRows: must be an integer between 1,000 and 100,000' },
        { status: 400 }
      );
    }
    const parsed = Number(telemetryMaxRowsStr);
    if (!Number.isSafeInteger(parsed) || parsed < 1000 || parsed > 100000) {
      return NextResponse.json(
        { error: 'Invalid telemetryMaxRows: must be an integer between 1,000 and 100,000' },
        { status: 400 }
      );
    }
    telemetryMaxRows = parsed;
  }

  const startTime = Date.now();
  let softDeleted = 0;
  let purgeResult = { wouldDelete: 0, hardDeleted: 0 };
  let telemetryPurge = { deleted: 0, batches: 0, capped: false };
  const failedSteps: RetentionStepName[] = [];

  // Step 1: Mark expired (older than 90 days)
  try {
    if (!dryRun) {
      softDeleted = await RetentionService.markExpired();
    }
  } catch (err) {
    console.error('[RetentionCron] RetentionService.markExpired failed:', err);
    failedSteps.push('markExpired');
  }

  // Step 2: Purge expired (older than 7 days since soft delete)
  try {
    purgeResult = await RetentionService.purgeExpired(limit, dryRun);
  } catch (err) {
    console.error('[RetentionCron] RetentionService.purgeExpired failed:', err);
    failedSteps.push('purgeExpired');
  }

  // Step 3: Purge volume telemetry older than 30 days (isolated from steps 1-2)
  try {
    const telemetryCutoff = VolumeTelemetryService.cutoffDate(30);
    telemetryPurge = dryRun
      ? { deleted: 0, batches: 0, capped: false }
      : await VolumeTelemetryService.purge(telemetryCutoff, undefined, { maxRows: telemetryMaxRows });
  } catch (err) {
    console.error('[RetentionCron] VolumeTelemetryService.purge failed:', err);
    failedSteps.push('volumeTelemetryPurge');
  }

  const duration = Date.now() - startTime;
  const hasErrors = failedSteps.length > 0;
  const status = !hasErrors
    ? 'SUCCESS'
    : failedSteps.length === 3
    ? 'ERROR'
    : 'PARTIAL_ERROR';

  return NextResponse.json(
    {
      status,
      enabled: true,
      dryRun,
      wouldDelete: purgeResult.wouldDelete,
      softDeleted,
      hardDeleted: purgeResult.hardDeleted,
      telemetryDeleted: telemetryPurge.deleted,
      telemetryBatches: telemetryPurge.batches,
      telemetryCapped: telemetryPurge.capped,
      duration,
      ...(hasErrors
        ? {
            failedSteps,
            error:
              failedSteps.length === 3
                ? 'All retention purge steps failed'
                : 'One or more retention purge steps failed',
          }
        : {}),
    },
    { status: hasErrors ? 500 : 200 }
  );
}
