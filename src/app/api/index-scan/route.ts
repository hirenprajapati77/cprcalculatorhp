import { NextResponse } from 'next/server';
import { CacheService } from '@/services/cache.service';
import { IndexDiscoverService } from '@/services/overnight/index-discover.service';
import { INDEX_SCORE } from '@/services/overnight/index-ranking.service';
import { INDEX_INTRA_SCORE } from '@/services/overnight/index-intra-ranking.service';
import { IndexRegimeService } from '@/services/overnight/index-regime.service';
import { getBtstWindowState, BTST_CLOCK, getISTDateString, getCashSessionState } from '@/lib/market-hours';
import { indexScanCacheKey } from '@/lib/index-cache-key';
import { persistIndexBtstOvernightSignals } from '@/services/overnight/index-overnight-persist';

export async function GET(_request: Request) {
  try {
    const now = new Date();
    // Index scanner is valid during pre-session (09:00–09:15) and live session (09:15–15:30).
    // This resolves the dead-code branch that had executionWindowOpen hardcoded to true.
    const cashState = getCashSessionState(now);
    const executionWindowOpen = cashState === 'LIVE' || cashState === 'PRESESSION';
    const windowState = getBtstWindowState(now);

    const today = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
    const CACHE_KEY = indexScanCacheKey(today);
    const dateStr = getISTDateString(now);
    const marketRegime = await IndexRegimeService.getMarketRegime(dateStr);

    /** Fresh enough to skip Yahoo re-scan (live UI polls every 60s). */
    const LIVE_CACHE_TTL_MS = 45_000;

    interface CachedIndexData {
      scannedAt: string;
      results: unknown[];
      insights: unknown;
      engine?: string;
      marketRegime?: unknown;
      cachedAtMs?: number;
    }

    const cachedLive = await CacheService.get<CachedIndexData>(CACHE_KEY);
    if (
      cachedLive &&
      typeof cachedLive.cachedAtMs === 'number' &&
      Date.now() - cachedLive.cachedAtMs < LIVE_CACHE_TTL_MS
    ) {
      return NextResponse.json({
        success: true,
        executionWindowOpen: true,
        cachedResult: true,
        scannedAt: cachedLive.scannedAt,
        degraded: false,
        results: cachedLive.results,
        insights: cachedLive.insights,
        engine: cachedLive.engine ?? 'index-advanced-unified',
        state: windowState,
        marketRegime: cachedLive.marketRegime ?? marketRegime,
      });
    }

    if (!executionWindowOpen) {
      if (cachedLive) {
        return NextResponse.json({
          success: true,
          executionWindowOpen: false,
          cachedResult: true,
          scannedAt: cachedLive.scannedAt,
          message: `Showing last scan from ${cachedLive.scannedAt}. Next live scan at ${BTST_CLOCK.marketOpen} IST.`,
          results: cachedLive.results,
          insights: cachedLive.insights,
          engine: cachedLive.engine ?? 'index-advanced-unified',
          state: windowState,
          marketRegime: (cachedLive as CachedIndexData).marketRegime ?? marketRegime,
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
        marketRegime,
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
    await persistIndexBtstOvernightSignals(btstResults);

    // F&O Option Suggestion Enrichment Layer
    // BTST: READY+ at INDEX_SCORE.READY (85). INTRA: READY+ at INDEX_INTRA_SCORE.READY (60).
    const intraReadyFloor = INDEX_INTRA_SCORE.READY;
    const btstReadyFloor = INDEX_SCORE.READY;
    const eligibleResults = resultsList.filter(
      (r) =>
        (r.direction === 'LONG' || r.direction === 'SHORT') &&
        r.score !== null &&
        r.score >= (r.scanType === 'INTRA' ? intraReadyFloor : btstReadyFloor) &&
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
    const scannedDateLabel = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
    const scannedAt = `${timeStr} IST, ${scannedDateLabel}`;

    const insights = {
      strongSignal: btstResults.filter((r) => r.classification === 'INDEX_STRONG').length,
      breakoutReady: btstResults.filter((r) => r.classification === 'INDEX_READY').length,
      avoid: btstResults.filter((r) => r.classification === 'IGNORE').length,
      // Scoped to BTST rows only (consistent with strongSignal/breakoutReady/avoid above).
      // INTRA direction counts are separate — combining them with BTST would mislead the UI.
      totalLong: btstResults.filter((r) => r.direction === 'LONG').length,
      totalShort: btstResults.filter((r) => r.direction === 'SHORT').length,
      totalConflict: 0,
    };

    const cacheData = {
      scannedAt,
      results: resultsList,
      insights,
      engine: 'index-advanced-unified',
      marketRegime,
      cachedAtMs: Date.now(),
    };

    await CacheService.set(CACHE_KEY, cacheData, 60); // 60s TTL; live path reuses for 45s

    return NextResponse.json({
      success: true,
      executionWindowOpen: true,
      cachedResult: false,
      degraded: false,
      results: resultsList,
      insights,
      engine: 'index-advanced-unified',
      state: windowState,
      marketRegime,
    });

  } catch (error) {
    console.error('Index API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to evaluate Index setups' }, { status: 500 });
  }
}
