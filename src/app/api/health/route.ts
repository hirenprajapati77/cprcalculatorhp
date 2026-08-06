import { env } from '@/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { getProcessMemorySnapshot } from '@/lib/process-memory';
import { QueueService } from '@/services/queue.service';
import { prisma } from '@/lib/db';
import { getISTDateString } from '@/lib/market-hours';
import { RegimeService } from '@/services/overnight/regime.service';
import { hashToken, timingSafeEqual } from '@/lib/auth-token';

export const dynamic = 'force-dynamic';

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const expected = env.APP_ACCESS_TOKEN?.trim();
  if (!expected) return env.NODE_ENV !== 'production';
  const authHeader = req.headers.get('authorization');
  const cookie = req.cookies.get('app_access_token')?.value;
  if (authHeader && timingSafeEqual(authHeader, `Bearer ${expected}`)) return true;
  if (cookie && timingSafeEqual(cookie, expected)) return true;
  // Unlock sets a SHA-256 hash of the token as the cookie value.
  if (cookie) {
    const expectedHash = await hashToken(expected);
    if (timingSafeEqual(cookie, expectedHash)) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const detailed = await isAuthorized(req);

  // Public probes: cheap DB ping only. Heavy overnight/regime/queue work is auth-gated
  // so unauthenticated scrapers cannot amplify Yahoo/DB load on the 1GB VM.
  if (!detailed) {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (err) {
      console.error('[Health Check Error] Database is unreachable:', err);
    }
    return NextResponse.json(
      { status: dbOk ? 'healthy' : 'degraded' },
      { status: dbOk ? 200 : 503 }
    );
  }

  const queueStatus = await QueueService.getQueueStatus();
  const queueList = Object.values(queueStatus.queues || {});

  const backtestMode = env.BACKTEST_EXECUTION_MODE || 'queue';
  const isProd = env.NODE_ENV === 'production';
  const historicalMode = env.HISTORICAL_MODE || 'mock';
  const hasMisconfig = isProd && historicalMode !== 'live';
  const executionMode = env.EXECUTION_MODE || 'SHADOW';
  const appVersion = env.APP_VERSION || process.env.npm_package_version || 'v1.0.0-rc.1';

  let dbStatus = 'healthy';
  let latestSignalDate: string | null = null;
  let latestEventDate: string | null = null;
  let signalsHealth = 'unknown';
  let eventsHealth = 'unknown';

  try {
    await prisma.$queryRaw`SELECT 1`;

    // Any overnight row (stock or index); freshness from createdAt — signalDate is a calendar key.
    const latestSignal = await prisma.overnightSignal.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { signalDate: true, createdAt: true },
    });
    if (latestSignal) {
      latestSignalDate = latestSignal.createdAt.toISOString();
      const diffHours = (Date.now() - latestSignal.createdAt.getTime()) / (1000 * 60 * 60);
      signalsHealth = diffHours < 72 ? 'healthy' : 'stale';
    } else {
      signalsHealth = 'no_data';
    }

    const latestEvent = await prisma.marketEvent.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
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
    console.error('[Health Check Error] Database is unreachable:', err);
  }

  // RegimeService is the live source of truth (in-memory / Yahoo) — not a dead Redis key.
  let latestRegimeDate: string | null = null;
  let regimeHealth = 'unknown';
  try {
    const today = getISTDateString();
    const regime = await RegimeService.getMarketRegime(today);
    latestRegimeDate = new Date().toISOString();
    regimeHealth = regime ? 'healthy' : 'no_data';
  } catch (err) {
    regimeHealth = 'error';
    console.error('[Health Check Error] Regime check failed:', err);
  }

  const redisOk = CacheService.isRedisConnected;
  const isHealthy = dbStatus === 'healthy';

  const publicBody = {
    status: isHealthy ? (redisOk ? 'healthy' : 'degraded') : 'degraded',
  };

  return NextResponse.json(
    {
      ...publicBody,
      ...(hasMisconfig
        ? { warning: `CRITICAL: Running in production but HISTORICAL_MODE is '${historicalMode}' instead of 'live'!` }
        : {}),
      version: appVersion,
      build: env.BUILD_TIMESTAMP || new Date().toISOString(),
      environment: env.NODE_ENV || 'development',
      executionMode,
      checks: {
        database: dbStatus,
        redis: redisOk ? 'connected' : 'disconnected',
        signals: signalsHealth,
        events: eventsHealth,
        regime: regimeHealth,
      },
      uptime: process.uptime(),
      timestamps: {
        latestSignal: latestSignalDate,
        latestEvent: latestEventDate,
        latestRegime: latestRegimeDate,
      },
      errors: {
        database: dbStatus === 'unhealthy' ? 'Database unreachable' : null,
        regime: regimeHealth === 'error' ? 'Regime check failed' : null,
      },
      cache: await CacheService.getMetrics(),
      memory: {
        process: getProcessMemorySnapshot(),
        l1: CacheService.getMemoryUsage(),
      },
      queue: {
        depth: queueList.reduce((sum, q) => sum + q.waiting, 0),
        active: queueList.reduce((sum, q) => sum + q.active, 0),
        failed: queueList.reduce((sum, q) => sum + q.failed, 0),
      },
      backtest: {
        mode: backtestMode,
        status: backtestMode === 'disabled' ? 'unavailable' : 'active',
      },
      historicalProvider: {
        mode: historicalMode,
        status: 'active',
      },
    },
    { status: isHealthy ? 200 : 503 }
  );
}
