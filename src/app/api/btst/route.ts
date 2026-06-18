import { NextResponse } from 'next/server';
import { BtstService } from '@/services/backtest/btst.service';
import { CacheService } from '@/services/cache.service';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const universe = searchParams.get('universe') || 'NIFTY50';

    const executionWindowOpen = BtstService.isExecutionWindowOpen();

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
          message: `Showing last scan from ${cached.scannedAt}. Next scan at 15:20 IST.`,
          results: cached.results,
          insights: cached.insights,
        });
      }
      return NextResponse.json({
        success: true,
        executionWindowOpen: false,
        cachedResult: false,
        message: 'BTST/STBT scanner runs only at 15:20–15:25 IST. Check back then.',
        results: [],
        insights: {
          strongSignal: 0, breakoutReady: 0, avoid: 0,
          totalLong: 0, totalShort: 0, totalConflict: 0,
        }
      });
    }

    // Window open — run scan then cache result
    const scanResult = await BtstService.discover(universe);

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
