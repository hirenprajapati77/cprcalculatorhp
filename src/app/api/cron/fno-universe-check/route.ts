import { NextResponse } from 'next/server';
import { isValidCronSecret } from '@/lib/crypto';
import { FnoUniverseCheckService } from '@/services/fno-universe-check.service';
import { TelegramService } from '@/services/alert/telegram.service';
import { MarketBreadthService } from '@/services/market-tools/market-breadth.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60; // Max allowed for Vercel/cron, safe fallback

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('x-cron-secret');
    if (!isValidCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await FnoUniverseCheckService.checkDrift();

    if (!result.ok || !result.data) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const diff = result.data;

    // Check universe coverage for DailyOhlcv records in the last 10 sessions
    const coverage = await MarketBreadthService.checkUniverseCoverage();
    const hasCoverageGaps = coverage.missingNifty50.length > 0 || coverage.missingFno.length > 0;

    // Fire Telegram alert if there is drift or missing coverage
    if (diff.hasDrift || hasCoverageGaps) {
      const truncateList = (list: string[], limit = 10) => {
        if (list.length <= limit) return list.map(s => s.trim()).join(', ');
        return `${list.slice(0, limit).map(s => s.trim()).join(', ')} ...and ${list.length - limit} more`;
      };

      const coverageWarning = hasCoverageGaps
        ? `\n\n⚠️ *DailyOhlcv Coverage Warnings (last 10 sessions):*\n` +
          (coverage.missingNifty50.length > 0 ? `NIFTY50 missing: ${truncateList(coverage.missingNifty50)}\n` : '') +
          (coverage.missingFno.length > 0 ? `FNO missing: ${truncateList(coverage.missingFno)}` : '')
        : '';

      const msg = `🚨 *F&O Universe Drift Detected* 🚨
Checked At: ${diff.checkedAt}
NSE List Count: ${diff.nseListCount}
Local F&O Count: ${diff.localListCount}

*Newly Eligible (${diff.newlyEligible.length}):*
${diff.newlyEligible.length > 0 ? truncateList(diff.newlyEligible) : 'None'}

*Newly Ineligible (${diff.newlyIneligible.length}):*
${diff.newlyIneligible.length > 0 ? truncateList(diff.newlyIneligible) : 'None'}

*Symbols Only In NSE (${diff.symbolsOnlyInNse.length}):*
${diff.symbolsOnlyInNse.length > 0 ? truncateList(diff.symbolsOnlyInNse) : 'None'}${coverageWarning}

_Runtime F&O eligibility updated automatically from authoritative NSE list. Update STOCK_UNIVERSE in market.service.ts to align static baseline._`;

      await TelegramService.sendMessage(msg);
    }

    return NextResponse.json({
      ...diff,
      coverage,
    });
  } catch (error: unknown) {
    console.error('FNO Universe Check Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Internal Server Error' }, { status: 500 });
  }
}
