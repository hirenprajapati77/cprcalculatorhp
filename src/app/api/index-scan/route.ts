import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { IndexDiscoverService } from '@/services/overnight/index-discover.service';
import { isBtstDiscoveryOpen, getBtstWindowState, BTST_CLOCK } from '@/lib/market-hours';
import { indexScanCacheKey } from '@/lib/index-cache-key';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bypassQuery = searchParams.get('bypass') === 'true';

    const now = new Date();
    const executionWindowOpen = isBtstDiscoveryOpen(now) || bypassQuery;
    const windowState = getBtstWindowState(now);

    const today = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
    const CACHE_KEY = indexScanCacheKey(today);

    interface CachedIndexData {
      scannedAt: string;
      results: unknown[];
      insights: unknown;
      engine?: string;
    }

    if (!executionWindowOpen) {
      const cached = await CacheService.get<CachedIndexData>(CACHE_KEY);
      if (cached) {
        return NextResponse.json({
          success: true,
          executionWindowOpen: false,
          cachedResult: true,
          scannedAt: cached.scannedAt,
          message: `Showing last scan from ${cached.scannedAt}. Next scan at ${BTST_CLOCK.discoveryStart} IST.`,
          results: cached.results,
          insights: cached.insights,
          engine: cached.engine ?? 'index-advanced',
          state: windowState,
        });
      }
      return NextResponse.json({
        success: true,
        executionWindowOpen: false,
        cachedResult: false,
        message: `Index scanner runs only at ${BTST_CLOCK.discoveryStart}–${BTST_CLOCK.discoveryEnd} IST. Check back then.`,
        results: [],
        insights: {
          strongSignal: 0, breakoutReady: 0, avoid: 0,
          totalLong: 0, totalShort: 0, totalConflict: 0,
        },
        engine: 'index-advanced',
        state: windowState,
      });
    }

    const resultsList = await IndexDiscoverService.discover(now);

    // Persist to DB
    for (const r of resultsList) {
      await prisma.overnightSignal.upsert({
        where: {
          symbol_signalDate_signalTime: {
            symbol: r.symbol,
            signalDate: r.signalDate,
            signalTime: r.signalTime,
          },
        },
        update: {
          direction: r.direction,
          entry: r.entry,
          stopLoss: r.stopLoss,
          target: r.target,
          overnightScore: r.score,
          classification: r.classification,
          instrumentType: 'INDEX',
        },
        create: {
          symbol: r.symbol,
          signalDate: r.signalDate,
          signalTime: r.signalTime,
          direction: r.direction,
          entry: r.entry,
          stopLoss: r.stopLoss,
          target: r.target,
          overnightScore: r.score,
          classification: r.classification,
          instrumentType: 'INDEX',
        },
      });
    }

    const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
    const scannedAt = `${timeStr} IST, ${dateStr}`;

    const insights = {
      strongSignal: resultsList.filter((r) => r.classification === 'INDEX_STRONG').length,
      breakoutReady: resultsList.filter((r) => r.classification === 'INDEX_READY').length,
      avoid: resultsList.filter((r) => r.classification === 'IGNORE').length,
      totalLong: resultsList.filter((r) => r.direction === 'LONG').length,
      totalShort: 0,
      totalConflict: 0,
    };

    const cacheData = {
      scannedAt,
      results: resultsList,
      insights,
      engine: 'index-advanced',
    };

    await CacheService.set(CACHE_KEY, cacheData, 86400); // 24 hour cache

    return NextResponse.json({
      success: true,
      executionWindowOpen: true,
      cachedResult: false,
      degraded: false,
      results: resultsList,
      insights,
      engine: 'index-advanced',
      state: windowState,
    });

  } catch (error) {
    console.error('Index API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to evaluate Index setups' }, { status: 500 });
  }
}
