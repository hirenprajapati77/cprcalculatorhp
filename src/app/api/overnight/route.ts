import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { OvernightService } from '@/services/overnight/overnight.service';
import { CacheService } from '@/services/cache.service';
import { buildInsightsFromOvernight } from '@/services/overnight/overnight-ui-adapter';
import { getISTDateString, BTST_CLOCK } from '@/lib/market-hours';

/** Matches historical Prisma `activeOnly` filter (READY+ / WATCH classifications). */
const ACTIVE_CLASSIFICATIONS = [
  'STRONG_BTST',
  'BTST_READY',
  'STRONG_STBT',
  'STBT_READY',
  'WATCH',
] as const;

type OvernightFilterable = {
  direction?: string;
  classification?: string;
};

/**
 * Read-side filters for today's overnight payload.
 * Cache always stores the full BOTH-direction set; callers filter on read.
 */
function applyOvernightQueryFilters<T extends OvernightFilterable>(
  signals: T[],
  direction: string | null,
  activeOnly: boolean
): T[] {
  let filtered = signals;
  if (direction && direction !== 'BOTH') {
    filtered = filtered.filter((s) => s.direction === direction);
  }
  if (activeOnly) {
    filtered = filtered.filter((s) =>
      (ACTIVE_CLASSIFICATIONS as readonly string[]).includes(s.classification ?? '')
    );
  }
  return filtered;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || getISTDateString();
    const direction = searchParams.get('direction');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    // Get today's date in IST
    const todayStr = getISTDateString();

    const isToday = date === todayStr;

    if (isToday) {
      const now = new Date();
      const state = OvernightService.determineState(now);

      const todayCacheKey = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
      const OVERNIGHT_KEY = `overnight_last_scan_${todayCacheKey}`;

      interface CachedOvernightData {
        scannedAt: string;
        results: OvernightFilterable[];
        insights: unknown;
      }

      // Live discovery spans DISCOVERING + ACTIVE (BTST_WINDOWS via getBtstWindowState)
      if (state !== 'ACTIVE' && state !== 'DISCOVERING') {
        const cached = await CacheService.get<CachedOvernightData>(OVERNIGHT_KEY);
        if (cached) {
          const filtered = applyOvernightQueryFilters(cached.results, direction, activeOnly);
          return NextResponse.json({
            success: true,
            windowOpen: false,
            cachedResult: true,
            scannedAt: cached.scannedAt,
            message: `Showing last scan from ${cached.scannedAt}. Next scan at ${BTST_CLOCK.discoveryStart} IST.`,
            results: filtered,
            insights: cached.insights,
            state,
          });
        }
        return NextResponse.json({
          success: true,
          windowOpen: false,
          cachedResult: false,
          message: `Overnight scanner activates at ${BTST_CLOCK.discoveryStart}–${BTST_CLOCK.discoveryEnd} IST.`,
          results: [],
          state,
        });
      }

      // Discovery open — run Advanced scan and cache
      const signals = await OvernightService.discover('BOTH');

      interface OvernightResultItem {
        symbol: string;
        ltp: number;
        overnightScore: number;
        direction: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK';
        entry?: number;
        stopLoss?: number;
        target?: number;
        optionSuggestion?: unknown;
      }

      const signalsList = signals as unknown as OvernightResultItem[];

      // F&O Option Suggestion Enrichment Layer for Overnight (LONG/SHORT, score >= 70, FnO only)
      try {
        const { MarketService } = await import('@/services/market.service');
        const fnoStocks = new Set(MarketService.getUniverse('NIFTY_FNO').map(s => s.symbol.trim()));

        const eligibleOvernight = signalsList
          .filter((r) => {
            const cleanSym = r.symbol.split(':')[0].trim();
            const score = r.overnightScore || 0;
            return fnoStocks.has(cleanSym) && score >= 70 && (r.direction === 'LONG' || r.direction === 'SHORT');
          })
          .sort((a, b) => (b.overnightScore || 0) - (a.overnightScore || 0))
          .slice(0, 10);

        if (eligibleOvernight.length > 0) {
          const { OptionSuggestionService } = await import('@/services/option-suggestion.service');
          const enrichmentPromises = eligibleOvernight.map(async (r) => {
            const cleanSym = r.symbol.split(':')[0].trim();
            try {
              const stockEntry = r.entry ?? r.ltp;
              const stockSl = r.stopLoss != null ? r.stopLoss : (r.direction === 'SHORT' ? r.ltp * 1.02 : r.ltp * 0.98);
              const stockTarget = r.target != null ? r.target : (r.direction === 'SHORT' ? r.ltp * 0.96 : r.ltp * 1.04);
              const suggestion = await OptionSuggestionService.suggestOptionForBtst(cleanSym, r.ltp, r.direction as 'LONG' | 'SHORT', stockEntry, stockSl, stockTarget);
              return { symbol: r.symbol, suggestion };
            } catch (e) {
              console.warn(`Failed to generate option suggestion for Overnight ${r.symbol}:`, e);
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

          for (const r of signalsList) {
            if (suggestionMap.has(r.symbol)) {
              r.optionSuggestion = suggestionMap.get(r.symbol);
            }
          }
        }
      } catch (enrichErr) {
        console.error('Error during option suggestion enrichment in Overnight route:', enrichErr);
      }

      // Compute insights (aligned with buildInsightsFromOvernight / ADVANCED_SCORE.STRONG=100)
      const insights = buildInsightsFromOvernight(signals);

      const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
      const scannedAt = `${timeStr} IST, ${dateStr}`;

      // Store full BOTH set (unfiltered) so direction/activeOnly share one cache entry
      const cacheData = {
        scannedAt,
        results: signals,
        insights,
      };

      await CacheService.set(OVERNIGHT_KEY, cacheData, 28800); // 8h: expires well before next market open

      const filtered = applyOvernightQueryFilters(signals, direction, activeOnly);

      return NextResponse.json({
        success: true,
        windowOpen: true,
        cachedResult: false,
        results: filtered,
        insights,
      });
    }

    // Historical date query - directly fetch from database
    const whereClause: Record<string, unknown> = {
      signalDate: date
    };

    if (direction && direction !== 'BOTH') {
      whereClause.direction = direction;
    }

    if (activeOnly) {
      whereClause.classification = {
        in: [...ACTIVE_CLASSIFICATIONS],
      };
    }

    const signals = await prisma.overnightSignal.findMany({
      where: whereClause,
      orderBy: [
        { overnightScore: 'desc' }
      ]
    });

    return NextResponse.json({
      success: true,
      windowOpen: false,
      cachedResult: false,
      results: signals,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
