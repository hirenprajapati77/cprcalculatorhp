import { NextResponse } from 'next/server';
import { BtstService } from '@/services/backtest/btst.service';
import { CacheService } from '@/services/cache.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import { BTST_CLOCK, getISTDateString } from '@/lib/market-hours';
import { ADVANCED_SCORE } from '@/config/trading-constants';
import { btstScanCacheKey } from '@/lib/btst-cache-key';
import { publicApiError } from '@/lib/api-error';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'NIFTY50';
    const bypassQuery = searchParams.get('bypass') === 'true';

    const executionWindowOpen = BtstService.isExecutionWindowOpen(bypassQuery);
    const windowState = OvernightService.determineState(new Date());

    const today = getISTDateString();
    const CACHE_KEY = btstScanCacheKey(today, universe);

    interface CachedBtstData {
      scannedAt: string;
      scannedEpoch?: number; // epoch ms — stored for recency checks
      results: unknown[];
      insights: unknown;
      coverage?: unknown;
      engine?: string;
    }

    // ── Resolve cache (used by all paths below) ──────────────────────────
    const cached = await CacheService.get<CachedBtstData>(CACHE_KEY);

    if (!executionWindowOpen && !bypassQuery) {
      // Outside window, no bypass — serve cache or closed message.
      if (cached) {
        const cachedCoverage = cached.coverage as { degraded?: boolean } | undefined;
        return NextResponse.json({
          success: true,
          executionWindowOpen: false,
          cachedResult: true,
          scannedAt: cached.scannedAt,
          message: `Showing last scan from ${cached.scannedAt}. Next scan at ${BTST_CLOCK.discoveryStart} IST.`,
          degraded: cachedCoverage?.degraded ?? false,
          results: cached.results,
          insights: cached.insights,
          engine: cached.engine ?? 'advanced',
          state: windowState,
          ...(cached.coverage ? { coverage: cached.coverage } : {}),
        });
      }
      return NextResponse.json({
        success: true,
        executionWindowOpen: false,
        cachedResult: false,
        message: `BTST/STBT scanner runs only at ${BTST_CLOCK.discoveryStart}–${BTST_CLOCK.discoveryEnd} IST. Check back then.`,
        results: [],
        insights: {
          strongSignal: 0, breakoutReady: 0, avoid: 0,
          totalLong: 0, totalShort: 0, totalConflict: 0,
        },
        engine: 'advanced',
        state: windowState,
      });
    }

    // ── Window open OR bypass active ──────────────────────────────────────
    // Serve today's cached scan if available and the caller hasn't requested a
    // forced refresh (bypass=true). This prevents hammering the market data
    // provider on every UI page load during the narrow 15:20-15:30 window.
    // Use bypass=true to trigger a fresh scan and overwrite the cache.
    if (cached && !bypassQuery) {
      const cachedCoverage = cached.coverage as { degraded?: boolean } | undefined;
      return NextResponse.json({
        success: true,
        executionWindowOpen,
        cachedResult: true,
        scannedAt: cached.scannedAt,
        message: `Showing scan from ${cached.scannedAt}. Use bypass=true to force a fresh scan.`,
        degraded: cachedCoverage?.degraded ?? false,
        results: cached.results,
        insights: cached.insights,
        engine: cached.engine ?? 'advanced',
        state: windowState,
        ...(cached.coverage ? { coverage: cached.coverage } : {}),
      });
    }

    // No cache, OR bypass=true (force refresh) — fall through to fresh discover.
    const discovery = await BtstService.discover(universe);
    const resultsList = discovery.results;
    const insights = discovery.insights;

    // F&O Option Suggestion Enrichment Layer for BTST (LONG) & STBT (SHORT)
    const eligibleBtst = resultsList
      .filter(
        (r) =>
          (r.tag === 'LONG' && r.longScore >= ADVANCED_SCORE.READY) ||
          (r.tag === 'SHORT' && r.shortScore >= ADVANCED_SCORE.READY)
      )
      .slice(0, 10);

    if (eligibleBtst.length > 0) {
      try {
        const { OptionSuggestionService } = await import('@/services/option-suggestion.service');
        const enrichmentPromises = eligibleBtst.map(async (r) => {
          try {
            const stockEntry = r.entry || r.ltp;
            const stockSl = r.sl || (r.tag === 'SHORT' ? r.ltp * 1.02 : r.ltp * 0.98);
            const stockTarget = r.target || (r.tag === 'SHORT' ? r.ltp * 0.96 : r.ltp * 1.04);
            const suggestion = await OptionSuggestionService.suggestOptionForBtst(
              r.symbol,
              r.ltp,
              r.tag as 'LONG' | 'SHORT',
              stockEntry,
              stockSl,
              stockTarget,
              today
            );
            return { symbol: r.symbol, suggestion };
          } catch (e) {
            console.warn(`Failed to generate option suggestion for BTST ${r.symbol}:`, e);
            return { symbol: r.symbol, suggestion: { error: 'FETCH_EXCEPTION' } };
          }
        });

        const enrichedResults = await Promise.allSettled(enrichmentPromises);
        const suggestionMap = new Map<string, unknown>();

        for (const res of enrichedResults) {
          if (res.status === 'fulfilled' && res.value && res.value.suggestion) {
            suggestionMap.set(res.value.symbol, res.value.suggestion);
          }
        }

        for (const r of resultsList) {
          if (suggestionMap.has(r.symbol)) {
            (r as (typeof resultsList)[number] & { optionSuggestion?: unknown }).optionSuggestion =
              suggestionMap.get(r.symbol);
          }
        }
      } catch (enrichErr) {
        console.error('Error during option suggestion enrichment in BTST route:', enrichErr);
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
    const scannedAt = `${timeStr} IST, ${dateStr}`;

    const coverage = discovery.coverage;

    const cacheData = {
      scannedAt,
      scannedEpoch: now.getTime(),
      results: resultsList,
      insights,
      coverage,
      engine: 'advanced',
    };

    await CacheService.set(CACHE_KEY, cacheData, 86400); // 24 hour cache

    return NextResponse.json({
      success: true,
      executionWindowOpen: true,
      cachedResult: false,
      degraded: false,
      results: resultsList,
      insights,
      coverage,
      engine: 'advanced',
      state: windowState,
    });

  } catch (error) {
    console.error('BTST API Error:', error);
    return NextResponse.json(
      { success: false, error: publicApiError(error, 'Failed to evaluate BTST setups') },
      { status: 500 }
    );
  }
}
