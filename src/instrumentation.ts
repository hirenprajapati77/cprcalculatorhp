import { prisma } from '@/lib/db';
import redis from '@/lib/redis';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // We only want this to run once on the server startup
    console.log('==================================================');
    console.log('🚀 CPR Calculator Platform - Node Startup Initialized');
    
    const appVersion = process.env.APP_VERSION || process.env.npm_package_version || 'unknown';
    const execMode = process.env.EXECUTION_MODE || 'SHADOW';
    console.log(`📦 VERSION: ${appVersion}`);
    console.log(`⚙️  MODE:    ${execMode}`);

    // Test DB
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ DB:      Reachable');
    } catch (e) {
      console.log('❌ DB:      UNREACHABLE');
    }

    // Test Redis
    try {
      const ping = await redis.ping();
      if (ping === 'PONG') {
        console.log('✅ REDIS:   Reachable');
      } else {
        console.log('⚠️ REDIS:   Degraded / Not responding to PING');
      }
    } catch (e) {
      console.log('❌ REDIS:   UNREACHABLE');
    }

    // Event Calendar Freshness Test
    try {
      const latestEvent = await prisma.marketEvent.findFirst({
        orderBy: { lastUpdated: 'desc' },
        select: { lastUpdated: true }
      });
      if (latestEvent) {
        const diffHours = (Date.now() - latestEvent.lastUpdated.getTime()) / (1000 * 60 * 60);
        if (diffHours > 72) {
          console.log(`❌ EVENTS:  STALE (Last sync ${diffHours.toFixed(1)}h ago)`);
        } else {
          console.log(`✅ EVENTS:  Fresh (Last sync ${diffHours.toFixed(1)}h ago)`);
        }
      } else {
        console.log('❌ EVENTS:  EMPTY (No data found)');
      }
    } catch (e) {
      console.log('❌ EVENTS:  DB Error during check');
    }

    console.log('==================================================');
  }
}
