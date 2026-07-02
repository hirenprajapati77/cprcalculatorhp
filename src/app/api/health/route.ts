import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { QueueService } from '@/services/queue.service';
import { prisma } from '@/lib/db';

export async function GET() {
  const queueStatus = await QueueService.getQueueStatus();
  const queueList = Object.values(queueStatus.queues || {});
  
  const backtestMode = process.env.BACKTEST_EXECUTION_MODE || 'queue';
  
  const isProd = process.env.NODE_ENV === 'production';
  const historicalMode = process.env.HISTORICAL_MODE || 'mock';
  const hasMisconfig = isProd && historicalMode !== 'live';

  if (hasMisconfig) {
    console.warn(`[LOUD WARNING] CRITICAL MISCONFIGURATION: Running in PRODUCTION but HISTORICAL_MODE is set to '${historicalMode}' instead of 'live'!`);
  }

  // Database Connection Health Check
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (dbError) {
    const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
    console.error('[Health Check Error] Database is unreachable:', dbError);
    return NextResponse.json({
      status: 'unhealthy',
      error: 'Database connection failed',
      details: errorMsg,
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime()
    }, { status: 503 });
  }
  
  return NextResponse.json({
    status: 'healthy',
    ...(hasMisconfig ? { warning: `CRITICAL: Running in production but HISTORICAL_MODE is '${historicalMode}' instead of 'live'!` } : {}),
    version: process.env.npm_package_version || '1.0.0',
    build: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cache: await CacheService.getMetrics(),
    queue: {
      depth: queueList.reduce((sum, q) => sum + q.waiting, 0),
      active: queueList.reduce((sum, q) => sum + q.active, 0),
      failed: queueList.reduce((sum, q) => sum + q.failed, 0)
    },
    backtest: {
      mode: backtestMode,
      status: backtestMode === 'disabled' ? 'unavailable' : 'active'
    },
    retention: (await import('@/services/retention/retention.service')).RetentionService.getHealth(),
    historicalProvider: {
      mode: historicalMode,
      status: 'active'
    },
    redis: {
      status: CacheService.isRedisConnected ? 'connected' : 'disconnected'
    },
    refresh: {
      isScannerRunning: false,
      lastRun: null,
    },
    uptime: process.uptime()
  }, { status: 200 });
}
