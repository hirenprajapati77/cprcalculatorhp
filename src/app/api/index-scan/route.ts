import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { IndexDiscoverService } from '@/services/overnight/index-discover.service';
import { INDEX_SCORE } from '@/services/overnight/index-ranking.service';
import { isMarketOpen, getBtstWindowState, BTST_CLOCK } from '@/lib/market-hours';
import { indexScanCacheKey } from '@/lib/index-cache-key';
import { prisma } from '@/lib/db';
import { env } from '@/config/env';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bypassQuery = searchParams.get('bypass') === 'true';

    const now = new Date();
    const bypassAllowed =
      bypassQuery ||
      (env.NODE_ENV !== 'production' && env.BTST_BYPASS_WINDOW === 'true');
    const executionWindowOpen = isMarketOpen(now) || bypassAllowed;
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
          message: `Showing last scan from ${cached.scannedAt}. Next live scan at ${BTST_CLOCK.marketOpen} IST.`,
          results: cached.results,
          insights: cached.insights,
          engine: cached.engine ?? 'index-advanced-unified',
          state: windowState,
        });
      }
      return NextResponse.json({
        success: true,
        executionWindowOpen: false,
        cachedResult: false,
        message: `Index scanner is active during live market hours (${BTST_CLOCK.marketOpen}–${BTST_CLOCK.marketClose} IST). Pre-session ${BTST_CLOCK.preOpen}–${BTST_CLOCK.marketOpen}.`,
        results: [],
        insights: {
          strongSignal: 0, breakoutReady: 0, avoid: 0,
          totalLong: 0, totalShort: 0, totalConflict: 0,
        },
        engine: 'index-advanced-unified',
        state: windowState,
      });
    }

    // Run both scans concurrently
    const [btstResults, intraResults] = await Promise.all([
      IndexDiscoverService.discover(now),
      IndexDiscoverService.discoverIntraday(now)
    ]);

    // Tag and combine
    const taggedBtst = btstResults.map(r => ({ ...r, scanType: 'BTST' }));
    const taggedIntra = intraResults.map(r => ({ ...r, scanType: 'INTRA' }));
    const resultsList = [...taggedIntra, ...taggedBtst];

    // Persist only BTST to DB (to keep historical Overnight signals clean)
    for (const r of btstResults) {
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

    // F&O Option Suggestion Enrichment Layer
    // READY+ only (score >= 70) — matches stock BTST gate intent (ADVANCED_SCORE.READY).
    // WATCH (40) is CPR-narrow alone and must not advertise Calls/Puts.
    const eligibleResults = resultsList.filter(
      (r) =>
        (r.direction === 'LONG' || r.direction === 'SHORT') &&
        r.score !== null &&
        r.score >= INDEX_SCORE.READY &&
        r.entry != null &&
        r.entry > 0 &&
        r.stopLoss != null &&
        r.target != null
    );

    if (eligibleResults.length > 0) {
      try {
        const { OptionSuggestionService } = await import('@/services/option-suggestion.service');
        const enrichmentPromises = eligibleResults.map(async (r) => {
          try {
            const stockEntry = r.entry as number;
            const stockSl = r.stopLoss as number;
            const stockTarget = r.target as number;

            const suggestion = await OptionSuggestionService.suggestOptionForBtst(
              r.symbol,
              stockEntry,
              r.direction,
              stockEntry,
              stockSl,
              stockTarget
            );
            // scanType disambiguates NIFTY appearing once as INTRA and once as BTST
            return { symbol: r.symbol, scanType: r.scanType, suggestion };
          } catch (e) {
            console.warn(`Failed option suggestion for ${r.symbol} (${r.scanType}):`, e);
            return { symbol: r.symbol, scanType: r.scanType, suggestion: { error: 'FETCH_EXCEPTION' } };
          }
        });

        const enrichedResults = await Promise.allSettled(enrichmentPromises);
        const suggestionMap = new Map<string, unknown>();

        for (const res of enrichedResults) {
          if (res.status === 'fulfilled' && res.value && res.value.suggestion) {
            suggestionMap.set(`${res.value.symbol}_${res.value.scanType}`, res.value.suggestion);
          }
        }

        for (const r of resultsList) {
          const key = `${r.symbol}_${r.scanType}`;
          if (suggestionMap.has(key)) {
            (r as Record<string, unknown>).optionSuggestion = suggestionMap.get(key);
          }
        }
      } catch (enrichErr) {
        console.error('Error during option suggestion enrichment in index route:', enrichErr);
      }
    }

    const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
    const scannedAt = `${timeStr} IST, ${dateStr}`;

    const insights = {
      strongSignal: btstResults.filter((r) => r.classification === 'INDEX_STRONG').length,
      breakoutReady: btstResults.filter((r) => r.classification === 'INDEX_READY').length,
      avoid: btstResults.filter((r) => r.classification === 'IGNORE').length,
      totalLong: resultsList.filter((r) => r.direction === 'LONG').length,
      totalShort: resultsList.filter((r) => r.direction === 'SHORT').length,
      totalConflict: 0,
    };

    const cacheData = {
      scannedAt,
      results: resultsList,
      insights,
      engine: 'index-advanced-unified',
    };

    await CacheService.set(CACHE_KEY, cacheData, 86400); // 24 hour cache

    return NextResponse.json({
      success: true,
      executionWindowOpen: true,
      cachedResult: false,
      degraded: false,
      results: resultsList,
      insights,
      engine: 'index-advanced-unified',
      state: windowState,
    });

  } catch (error) {
    console.error('Index API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to evaluate Index setups' }, { status: 500 });
  }
}
