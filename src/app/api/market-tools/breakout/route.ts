import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MultiYearBreakoutService } from '@/services/market-tools/multi-year-breakout.service';
import { isAuthorizedForRefresh } from '@/lib/market-tools-refresh-auth';

export const dynamic = 'force-dynamic';

const breakoutQuerySchema = z.object({
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
  window: z
    .enum(['ALL', '1Y', '2Y', '3Y', '5Y', '10Y', 'ATH'])
    .optional()
    .default('ALL'),
});

export async function GET(request: NextRequest) {
  try {
    const getParam = (key: string) => {
      const v = request.nextUrl.searchParams.get(key);
      return v === null || v.trim() === '' ? undefined : v.trim();
    };

    const parsed = breakoutQuerySchema.safeParse({
      refresh: getParam('refresh'),
      window: getParam('window'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    const { refresh: forceRefresh, window: windowFilter } = parsed.data;

    // B3 fix: ?refresh=true scans 2,636 symbols × multiple year windows.
    // Gate behind auth even though middleware exempts this route for page loads.
    if (forceRefresh && !(await isAuthorizedForRefresh(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const report = await MultiYearBreakoutService.getBreakoutReport(forceRefresh);

    let filteredStocks = report.stocks;
    if (windowFilter !== 'ALL') {
      filteredStocks = report.stocks.filter((s) => {
        if (windowFilter === '1Y') return s.breakout1Y === true;
        if (windowFilter === '2Y') return s.breakout2Y === true;
        if (windowFilter === '3Y') return s.breakout3Y === true;
        if (windowFilter === '5Y') return s.breakout5Y === true;
        if (windowFilter === '10Y') return s.breakout10Y === true;
        if (windowFilter === 'ATH') return s.breakoutATH === true;
        return true;
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        stocks: filteredStocks,
      },
    });
  } catch (err) {
    console.error('[API:MarketTools:Breakout] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
