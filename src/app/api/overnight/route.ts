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
