import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { RetentionService } from '@/services/retention/retention.service';
import { VolumeTelemetryService } from '@/services/retention/volume-telemetry.service';
import { isValidCronSecret } from '@/lib/crypto';

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

  const startTime = Date.now();
  let softDeleted = 0;
  let purgeResult = { wouldDelete: 0, hardDeleted: 0 };
  let telemetryPurge = { deleted: 0, batches: 0, capped: false };

  // Step 1: Mark expired (older than 90 days)
  try {
    if (!dryRun) {
      softDeleted = await RetentionService.markExpired();
    }
  } catch (err) {
    console.error('[RetentionCron] RetentionService.markExpired failed:', err);
  }

  // Step 2: Purge expired (older than 7 days since soft delete)
  try {
    purgeResult = await RetentionService.purgeExpired(limit, dryRun);
  } catch (err) {
    console.error('[RetentionCron] RetentionService.purgeExpired failed:', err);
  }

  // Step 3: Purge volume telemetry older than 30 days (isolated from steps 1-2)
  try {
    const telemetryCutoff = VolumeTelemetryService.cutoffDate(30);
    telemetryPurge = dryRun
      ? { deleted: 0, batches: 0, capped: false }
      : await VolumeTelemetryService.purge(telemetryCutoff);
  } catch (err) {
    console.error('[RetentionCron] VolumeTelemetryService.purge failed:', err);
  }

  const duration = Date.now() - startTime;

  return NextResponse.json({
    enabled: true,
    dryRun,
    wouldDelete: purgeResult.wouldDelete,
    softDeleted,
    hardDeleted: purgeResult.hardDeleted,
    telemetryDeleted: telemetryPurge.deleted,
    telemetryBatches: telemetryPurge.batches,
    telemetryCapped: telemetryPurge.capped,
    duration
  });
}
