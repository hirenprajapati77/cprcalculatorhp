import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { QueueService } from '@/services/queue.service';
import { BacktestService } from '@/services/backtest/backtest.service';

export async function GET() {
  const queueStatus = await QueueService.getQueueStatus();
  const queueList = Object.values(queueStatus.queues || {});
  
  const backtestMode = process.env.BACKTEST_EXECUTION_MODE || 'queue';
  const btQueue = BacktestService.getQueue();
  
  return NextResponse.json({
    status: 'healthy',
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
    redis: {
      status: btQueue ? 'connected' : 'disconnected'
    },
    refresh: {
      isScannerRunning: false,
      lastRun: null,
    },
    uptime: process.uptime()
  }, { status: 200 });
}
