import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { RetentionService } from '@/services/retention/retention.service';
import { isValidCronSecret } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('x-cron-secret');
  
  if (!isValidCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === 'true' || env.RETENTION_DRY_RUN === 'true';
  const limitStr = searchParams.get('limit') || env.RETENTION_LIMIT?.toString() || '250';
  const limit = Math.min(parseInt(limitStr, 10), 1000);

  try {
    const startTime = Date.now();
    
    // Step 1: Mark expired (older than 90 days)
    const softDeleted = dryRun ? 0 : await RetentionService.markExpired();

    // Step 2: Purge expired (older than 7 days since soft delete)
    const purgeResult = await RetentionService.purgeExpired(limit, dryRun);

    const duration = Date.now() - startTime;

    return NextResponse.json({
      enabled: true,
      dryRun,
      wouldDelete: purgeResult.wouldDelete,
      softDeleted,
      hardDeleted: purgeResult.hardDeleted,
      duration
    });
  } catch (error: unknown) {
    console.error('Retention cron failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
