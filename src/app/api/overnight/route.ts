import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { OvernightService } from '@/services/overnight/overnight.service';
import { CacheService } from '@/services/cache.service';

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const direction = searchParams.get('direction');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    // Get today's date in IST
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date()); // YYYY-MM-DD

    const isToday = date === todayStr;

    if (isToday) {
      const now = new Date();
      const state = OvernightService.determineState(now);

      const todayCacheKey = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-');
      const OVERNIGHT_KEY = `overnight_last_scan_${todayCacheKey}`;

      interface CachedOvernightData {
        scannedAt: string;
        results: unknown[];
        insights: unknown;
      }

      if (state !== 'ACTIVE') {
        const cached = await CacheService.get<CachedOvernightData>(OVERNIGHT_KEY);
        if (cached) {
          return NextResponse.json({
            success: true,
            windowOpen: false,
            cachedResult: true,
            scannedAt: cached.scannedAt,
            message: `Showing last scan from ${cached.scannedAt}. Next scan at 15:20 IST.`,
            results: cached.results,
            insights: cached.insights,
            state,
          });
        }
        return NextResponse.json({
          success: true,
          windowOpen: false,
          cachedResult: false,
          message: 'Overnight scanner activates at 15:20–15:25 IST.',
          results: [],
          state,
        });
      }

      // ACTIVE — run scan and cache
      const signals = await OvernightService.discover('BOTH');

      interface OvernightResultItem {
        symbol: string;
        ltp: number;
        overnightScore: number;
        direction: 'LONG' | 'SHORT' | 'NEUTRAL_CONFLICT' | 'WEAK';
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
              const stockEntry = r.entry || r.ltp;
              const stockSl = r.stopLoss || (r.direction === 'SHORT' ? r.ltp * 1.02 : r.ltp * 0.98);
              const stockTarget = r.target || (r.direction === 'SHORT' ? r.ltp * 0.96 : r.ltp * 1.04);
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

      // Compute insights
      let strongSignal = 0;
      let breakoutReady = 0;
      let avoid = 0;
      let totalLong = 0;
      let totalShort = 0;
      let totalConflict = 0;

      for (const sig of signals) {
        const maxScore = sig.overnightScore || 0;
        if (sig.classification === 'NEUTRAL_CONFLICT') {
          totalConflict++;
          avoid++;
        } else if (sig.classification === 'IGNORE') {
          avoid++;
        } else {
          if (maxScore >= 90) {
            strongSignal++;
          } else if (maxScore >= 70) {
            breakoutReady++;
          } else if (maxScore < 40) {
            avoid++;
          }
          if (sig.direction === 'LONG') totalLong++;
          if (sig.direction === 'SHORT') totalShort++;
        }
      }

      const insights = {
        strongSignal,
        breakoutReady,
        avoid,
        totalLong,
        totalShort,
        totalConflict
      };

      const timeStr = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });
      const scannedAt = `${timeStr} IST, ${dateStr}`;

      const cacheData = {
        scannedAt,
        results: signals,
        insights,
      };

      await CacheService.set(OVERNIGHT_KEY, cacheData, 86400);

      return NextResponse.json({
        success: true,
        windowOpen: true,
        cachedResult: false,
        results: signals,
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
        in: ['STRONG_BTST', 'BTST_READY', 'STRONG_STBT', 'STBT_READY', 'WATCH']
      };
    }

    const signals = await prisma.overnightSignal.findMany({
      where: whereClause,
      orderBy: [
        { overnightScore: 'desc' }
      ]
    });

    return NextResponse.json(signals);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
