import { NextRequest, NextResponse } from 'next/server';
import { ScannerService } from '@/services/scanner.service';
import { CacheService } from '@/services/cache.service';

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('x-cron-secret');

  if (!cronSecret || authHeader !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await ScannerService.scan('NIFTY_FNO');
    
    await CacheService.set('AUTO_SCAN_RESULT', {
      data: results,
      timestamp: new Date().toISOString()
    }, 60 * 60); // cache for 1 hour

    return NextResponse.json({ success: true, count: results.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
