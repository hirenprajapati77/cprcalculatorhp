import { NextResponse } from 'next/server';
import { BtstService } from '@/services/backtest/btst.service';
import { CacheService } from '@/services/cache.service';
import { OvernightService } from '@/services/overnight/overnight.service';
import { BTST_CLOCK } from '@/lib/market-hours';
import { ADVANCED_SCORE } from '@/config/trading-constants';
import { btstScanCacheKey } from '@/lib/btst-cache-key';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'NIFTY50';
    const bypassQuery = searchParams.get('bypass') === 'true';

    const executionWindowOpen = BtstService.isExecutionWindowOpen(bypassQuery);
    const windowState = OvernightService.determineState(new Date());

    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
    const CACHE_KEY = btstScanCacheKey(today, universe);

    interface CachedBtstData {
      scannedAt: string;
      results: unknown[];
      insights: unknown;
      coverage?: unknown;
      engine?: string;
    }

    if (!executionWindowOpen && !bypassQuery) {
      const cached = await CacheService.get<CachedBtstData>(CACHE_KEY);
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

    // Bypass ON or window open — check cache first, then run discover if needed
    if (bypassQuery) {
      const cached = await CacheService.get<CachedBtstData>(CACHE_KEY);
      if (cached) {
        const cachedCoverage = cached.coverage as { degraded?: boolean } | undefined;
        return NextResponse.json({
          success: true,
          executionWindowOpen: true,
          cachedResult: true,
          scannedAt: cached.scannedAt,
          message: `[Bypass Active] Displaying scan results from ${cached.scannedAt}`,
          degraded: cachedCoverage?.degraded ?? false,
          results: cached.results,
          insights: cached.insights,
          engine: cached.engine ?? 'advanced',
          state: windowState,
          ...(cached.coverage ? { coverage: cached.coverage } : {}),
        });
      }
    }

    // Window open — single source of truth: same discover path as the
    // btst-alert / btst-journal crons (BtstService.discover -> Advanced
    // engine bridge). Do not re-implement discover/filter/map here.
    const discovery = await BtstService.discover(universe);
    const resultsList = discovery.results;
    const insights = discovery.insights;

    // F&O Option Suggestion Enrichment Layer for BTST (LONG) & STBT (SHORT)
    const eligibleBtst = resultsList
      .filter((r) => (r.tag === 'LONG' || r.tag === 'SHORT') && Math.max(r.longScore, r.shortScore) >= ADVANCED_SCORE.READY)
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
              stockTarget
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
    return NextResponse.json({ success: false, error: 'Failed to evaluate BTST setups' }, { status: 500 });
  }
}
