const fs = require('fs');

let c = fs.readFileSync('src/app/api/scanner/route.ts', 'utf8');

// 1. replace process.env.
c = c.replace(/process\.env\.([A-Z0-9_]+)/g, 'env.$1');
if (c.includes('env.') && !c.includes('import { env }')) {
  c = "import { env } from '@/config/env';\n" + c;
}

// 2. add circuit breaker import
if (!c.includes('DatabaseCircuitBreaker')) {
  c = c.replace("import { isMarketOpen } from '@/lib/market-hours';", "import { isMarketOpen } from '@/lib/market-hours';\nimport { DatabaseCircuitBreaker } from '@/lib/circuit-breaker';");
}

// 3. Add circuit breaker block at start of GET
const fallbackBlock = `
    // If circuit is open, fallback to cache immediately
    if (DatabaseCircuitBreaker.isOpen()) {
      const { CacheService } = await import('@/services/cache.service');
      const cached = await CacheService.get('AUTO_SCAN_RESULT');
      if (cached && typeof cached === 'object' && 'data' in cached) {
        const cachedData = cached as { data: any[]; timestamp?: string };
        return NextResponse.json({
          success: true,
          degraded: true,
          message: 'Serving cached data because the database is temporarily unavailable.',
          cachedAt: cachedData.timestamp,
          results: cachedData.data,
          fromCache: true
        });
      }
      return NextResponse.json({ success: false, degraded: true, message: 'Database is unavailable and no cache is available', results: [] }, { status: 503 });
    }
`;
c = c.replace("    // 1. Auto-initialize today's database records if empty", fallbackBlock + "\n    // 1. Auto-initialize today's database records if empty");

// 4. Wrap prisma.scannerResult.count
c = c.replace("await prisma.scannerResult.count({\n        where: { date: today },\n      });", "await DatabaseCircuitBreaker.execute(() => prisma.scannerResult.count({\n        where: { date: today },\n      }));");

// 5. Wrap Promise.all
c = c.replace("await Promise.all([", "await DatabaseCircuitBreaker.execute(() => Promise.all([");
c = c.replace("select: { score: true, signalSummary: true }\n      })\n    ]);", "select: { score: true, signalSummary: true }\n      })\n    ]));");

// 6. Wrap topForOptions
c = c.replace("await prisma.scannerResult.findMany({\n        where: { ...where, score: { gte: 75 } },", "await DatabaseCircuitBreaker.execute(() => prisma.scannerResult.findMany({\n        where: { ...where, score: { gte: 75 } },");
c = c.replace("score: true\n        }\n      });", "score: true\n        }\n      }));");

// 7. Catch block
const catchBlock = `  } catch (error) {
    if (error instanceof Error && error.message === 'CIRCUIT_OPEN') {
      const { CacheService } = await import('@/services/cache.service');
      const cached = await CacheService.get('AUTO_SCAN_RESULT');
      if (cached && typeof cached === 'object' && 'data' in cached) {
        const cachedData = cached as { data: any[]; timestamp?: string };
        return NextResponse.json({
          success: true,
          degraded: true,
          message: 'Serving cached data because the database is temporarily unavailable.',
          cachedAt: cachedData.timestamp,
          results: cachedData.data
        });
      }
      return NextResponse.json({ success: false, error: 'Database is temporarily unavailable' }, { status: 503 });
    }
    console.error('Error fetching V2 scanner data:', error);`;

c = c.replace("  } catch (err) {\n    console.error('Error fetching V2 scanner data:', err);", catchBlock);

fs.writeFileSync('src/app/api/scanner/route.ts', c);
console.log('Modified src/app/api/scanner/route.ts successfully.');
