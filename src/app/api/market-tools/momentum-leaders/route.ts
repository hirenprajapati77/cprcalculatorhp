import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { MomentumLeadersService } from '@/services/market-tools/momentum-leaders.service';
import { isAuthorizedForRefresh } from '@/lib/market-tools-refresh-auth';

export const dynamic = 'force-dynamic';

const momentumLeadersQuerySchema = z.object({
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((val) => val === 'true'),
  universe: z
    .enum(['NSE_FNO', 'ALL_NSE'])
    .optional()
    .default('NSE_FNO'),
  tier: z
    .preprocess(
      (val) => (typeof val === 'string' && val.trim() === 'A ' ? 'A+' : val),
      z.enum(['ALL', 'A+', 'A', 'B', 'C'])
    )
    .optional()
    .default('ALL'),
  windows: z
    .enum(['ALL', '4', '3', '2', '1'])
    .optional()
    .default('ALL'),
  sector: z
    .string()
    .trim()
    .max(100)
    .optional()
    .default('ALL'),
});

export async function GET(request: NextRequest) {
  try {
    const getParam = (key: string) => {
      const v = request.nextUrl.searchParams.get(key);
      return v === null || v.trim() === '' ? undefined : v.trim();
    };

    const parsed = momentumLeadersQuerySchema.safeParse({
      refresh: getParam('refresh'),
      universe: getParam('universe'),
      tier: getParam('tier'),
      windows: getParam('windows'),
      sector: getParam('sector'),
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

    const {
      refresh: forceRefresh,
      universe,
      tier: tierFilter,
      windows: windowLeaderFilter,
      sector: sectorFilter,
    } = parsed.data;

    // Gate heavy refresh behind auth — prevents unauthenticated DDoS of the DB scan
    if (forceRefresh && !(await isAuthorizedForRefresh(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const report = await MomentumLeadersService.getMomentumLeadersReport(forceRefresh, universe);

    let filteredStocks = report.allStocks;

    if (tierFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter((s) => s.tier === tierFilter);
    }

    if (windowLeaderFilter !== 'ALL') {
      const minWindows = parseInt(windowLeaderFilter, 10);
      filteredStocks = filteredStocks.filter((s) => s.leaderWindowCount >= minWindows);
    }

    if (sectorFilter !== 'ALL') {
      filteredStocks = filteredStocks.filter((s) => s.sector === sectorFilter);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...report,
        allStocks: filteredStocks,
      },
    });
  } catch (err) {
    console.error('[API:MarketTools:MomentumLeaders] Error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}