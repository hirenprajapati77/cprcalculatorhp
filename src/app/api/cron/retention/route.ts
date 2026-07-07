import { NextResponse } from 'next/server';
import { RetentionService } from '@/services/retention/retention.service';

export async function GET(request: Request) {
  // Authorization check — matches all other cron routes: x-cron-secret header, no fallback
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('x-cron-secret');
  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === 'true' || process.env.RETENTION_DRY_RUN === 'true';
  const limitStr = searchParams.get('limit') || process.env.RETENTION_LIMIT || '250';
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
