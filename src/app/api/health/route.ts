import { env } from '@/config/env';
import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { QueueService } from '@/services/queue.service';
import { prisma } from '@/lib/db';
import redis from '@/lib/redis';
import { STOCK_OVERNIGHT_INSTRUMENT_WHERE } from '@/lib/overnight-instrument-filter';

export const dynamic = 'force-dynamic';

export async function GET() {
  const queueStatus = await QueueService.getQueueStatus();
  const queueList = Object.values(queueStatus.queues || {});
  
  const backtestMode = env.BACKTEST_EXECUTION_MODE || 'queue';
  const isProd = env.NODE_ENV === 'production';
  const historicalMode = env.HISTORICAL_MODE || 'mock';
  const hasMisconfig = isProd && historicalMode !== 'live';
  const executionMode = env.EXECUTION_MODE || 'SHADOW';
  const appVersion = env.APP_VERSION || process.env.npm_package_version || 'v1.0.0-rc.1';

  let dbStatus = 'healthy';
  let dbError = null;
  let latestSignalDate = null;
  let latestEventDate = null;
  let signalsHealth = 'unknown';
  let eventsHealth = 'unknown';

  // Database Connection & Data Freshness Health Check
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    // Check Latest Signal
    const latestSignal = await prisma.overnightSignal.findFirst({
      where: { ...STOCK_OVERNIGHT_INSTRUMENT_WHERE },
      orderBy: { signalDate: 'desc' },
      select: { signalDate: true }
    });
    if (latestSignal) {
      const latestSignalDateObj = new Date(latestSignal.signalDate);
      latestSignalDate = latestSignalDateObj.toISOString();
      const diffHours = (Date.now() - latestSignalDateObj.getTime()) / (1000 * 60 * 60);
      signalsHealth = diffHours < 72 ? 'healthy' : 'stale';
    } else {
      signalsHealth = 'no_data';
    }

    // Check Latest Event
    const latestEvent = await prisma.marketEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });
    if (latestEvent) {
      latestEventDate = latestEvent.createdAt.toISOString();
      const diffHours = (Date.now() - latestEvent.createdAt.getTime()) / (1000 * 60 * 60);
      eventsHealth = diffHours < 48 ? 'healthy' : 'stale';
    } else {
      eventsHealth = 'no_data';
    }
  } catch (err) {
    dbStatus = 'unhealthy';
    dbError = err instanceof Error ? err.message : String(err);
    console.error('[Health Check Error] Database is unreachable:', err);
  }

  // Check Regime Snapshot Freshness
  let latestRegimeDate = null;
  let regimeHealth = 'unknown';
  let regimeError = null;
  try {
    if (redis) {
      const regimeData = await redis.get('cpr:market_regime:NIFTY_50');
      if (regimeData) {
        const parsed = JSON.parse(regimeData);
        if (parsed.timestamp) {
          latestRegimeDate = parsed.timestamp;
          const diffHours = (Date.now() - new Date(parsed.timestamp).getTime()) / (1000 * 60 * 60);
          regimeHealth = diffHours < 48 ? 'healthy' : 'stale';
        } else {
          regimeHealth = 'unknown_format';
        }
      } else {
        regimeHealth = 'no_data';
      }
    } else {
      regimeHealth = 'redis_not_connected';
    }
  } catch (err) {
    regimeHealth = 'error';
    regimeError = err instanceof Error ? err.message : String(err);
  }
  
  const isHealthy = dbStatus === 'healthy';

  return NextResponse.json({
    status: isHealthy ? 'healthy' : 'degraded',
    ...(hasMisconfig ? { warning: `CRITICAL: Running in production but HISTORICAL_MODE is '${historicalMode}' instead of 'live'!` } : {}),
    version: appVersion,
    build: env.BUILD_TIMESTAMP || new Date().toISOString(),
    environment: env.NODE_ENV || 'development',
    executionMode,
    checks: {
      database: dbStatus,
      redis: CacheService.isRedisConnected ? 'connected' : 'disconnected',
      signals: signalsHealth,
      events: eventsHealth,
      regime: regimeHealth
    },
    timestamps: {
      latestSignal: latestSignalDate,
      latestEvent: latestEventDate,
      latestRegime: latestRegimeDate
    },
    errors: {
      database: dbError,
      regime: regimeError
    },
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
    historicalProvider: {
      mode: historicalMode,
      status: 'active'
    },
    uptime: process.uptime()
  }, { status: isHealthy ? 200 : 503 });
}
