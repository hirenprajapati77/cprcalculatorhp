import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { QueueService } from '@/services/queue.service';
import * as os from 'os';

export async function GET() {
  const cacheMemory = CacheService.getMemoryUsage();
  
  return NextResponse.json({
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    build: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cache: {
      provider: CacheService.getProvider(),
      redisConnected: CacheService.isRedisConnected,
      memoryUsage: cacheMemory,
    },
    queues: await QueueService.getQueueStatus(),
    refresh: {
      isScannerRunning: false, // will integrate with scheduler service later
      lastRun: null,
    },
    uptime: process.uptime(),
    system: {
      freemem: os.freemem(),
      totalmem: os.totalmem(),
    }
  }, { status: 200 });
}
