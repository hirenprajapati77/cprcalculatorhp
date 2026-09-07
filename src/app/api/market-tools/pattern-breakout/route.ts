import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PatternBreakoutService } from '@/services/market-tools/pattern-breakout.service';
import { isAuthorizedForRefresh } from '@/lib/market-tools-refresh-auth';

export const dynamic = 'force-dynamic';

const patternBreakoutQuerySchema = z.object({
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
  pattern: z
    .enum(['ALL', 'FLAG_POLE', 'VCP', 'CUP_AND_HANDLE', 'DOUBLE_BOTTOM', 'FLAT_BASE', 'NONE'])
    .optional()
    .default('ALL'),
  status: z
    .enum(['ALL', 'BREAKOUT', 'NEAR_HIGH'])
    .optional()
    .default('ALL'),
  tier: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === 'A ' ? 'A+' : val),
      z.enum(['ALL', 'A+', 'A', 'B', 'C'])
    )
    .optional()
    .default('ALL'),
});

export async function GET(request: NextRequest) {
  try {
    const getParam = (key: string) => {
      const v = request.nextUrl.searchParams.get(key);
      return v === null || v.trim() === '' ? undefined : v.trim();
    };

    const parsed = patternBreakoutQuerySchema.safeParse({
      refresh: getParam('refresh'),
      pattern: getParam('pattern'),
      status: getParam('status'),
      tier: getParam('tier'),
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

    const { refresh: forceRefresh, pattern: patternFilter, status: statusFilter, tier: tierFilter } = parsed.data;

    // Gate heavy refresh behind auth — prevents unauthenticated DDoS of the DB scan
    if (forceRefresh && !(await isAuthorizedForRefresh(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const report = await PatternBreakoutService.getPatternBreakoutReport(forceRefresh);

    let filteredStocks = report.stocks;
    if (patternFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter((s) => s.primaryPattern === patternFilter);
    }
    if (statusFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter((s) => s.status === statusFilter);
    }
    if (tierFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter((s) => s.scoreBreakdown.qualityTier === tierFilter);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        stocks: filteredStocks,
      },
    });
  } catch (err) {
    console.error('[API:MarketTools:PatternBreakout] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
