import { NextResponse } from 'next/server';
import { BtstService } from '@/services/backtest/btst.service';
import { CacheService } from '@/services/cache.service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'NIFTY50';
    const bypassQuery = searchParams.get('bypass') === 'true';

    const executionWindowOpen = BtstService.isExecutionWindowOpen(bypassQuery);

    const today = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
    const CACHE_KEY = `btst_last_scan_${today}`;

    interface CachedBtstData {
      scannedAt: string;
      results: unknown[];
      insights: unknown;
    }

    if (!executionWindowOpen) {
      const cached = await CacheService.get<CachedBtstData>(CACHE_KEY);
      if (cached) {
        return NextResponse.json({
          success: true,
          executionWindowOpen: false,
          cachedResult: true,
          scannedAt: cached.scannedAt,
          message: `Showing last scan from ${cached.scannedAt}. Next scan at 15:10 IST.`,
          results: cached.results,
          insights: cached.insights,
        });
      }
      return NextResponse.json({
        success: true,
        executionWindowOpen: false,
        cachedResult: false,
        message: 'BTST/STBT scanner runs only at 15:10–15:25 IST. Check back then.',
        results: [],
        insights: {
          strongSignal: 0, breakoutReady: 0, avoid: 0,
          totalLong: 0, totalShort: 0, totalConflict: 0,
        }
      });
    }

    // Window open — run scan then cache result
    const scanResult = await BtstService.discover(universe);

    interface BtstResultItem {
      symbol: string;
      ltp: number;
      longScore: number;
      shortScore: number;
      tag: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK';
      optionSuggestion?: unknown;
    }

    const resultsList = scanResult.results as BtstResultItem[];

    // F&O Option Suggestion Enrichment Layer for BTST (LONG) & STBT (SHORT)
    const eligibleBtst = resultsList
      .filter((r) => (r.tag === 'LONG' || r.tag === 'SHORT') && Math.max(r.longScore, r.shortScore) >= 70)
      .slice(0, 10);

    if (eligibleBtst.length > 0) {
      try {
        const { OptionSuggestionService } = await import('@/services/option-suggestion.service');
        const enrichmentPromises = eligibleBtst.map(async (r) => {
          try {
            const suggestion = await OptionSuggestionService.suggestOptionForBtst(r.symbol, r.ltp, r.tag as 'LONG' | 'SHORT', r.entry, r.sl, r.target);
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
            r.optionSuggestion = suggestionMap.get(r.symbol);
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

    const cacheData = {
      scannedAt,
      results: scanResult.results,
      insights: scanResult.insights,
    };

    await CacheService.set(CACHE_KEY, cacheData, 86400); // 24 hour cache

    return NextResponse.json({
      success: true,
      executionWindowOpen: true,
      cachedResult: false,
      ...scanResult,
    });

  } catch (error) {
    console.error('BTST API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to evaluate BTST setups' }, { status: 500 });
  }
}
