import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { QueueService } from '@/services/queue.service';
export async function GET() {
  const queueStatus = await QueueService.getQueueStatus();
  const queueList = Object.values(queueStatus.queues || {});
  
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
    refresh: {
      isScannerRunning: false,
      lastRun: null,
    },
    uptime: process.uptime()
  }, { status: 200 });
}
