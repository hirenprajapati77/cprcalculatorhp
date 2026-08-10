import { prisma } from '@/lib/db';
import { env } from '@/config/env';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';

export type CprJournalJobResult = {
  success: boolean;
  logged: string[];
  skipped: string[];
  message?: string;
};

/**
 * Shared CPR journal pipeline for cron route and in-process scheduler.
 * Note: Claim lock is handled at the caller/entry point (route/scheduler) to prevent double-locking.
 */
export async function runCprJournalJob(): Promise<CprJournalJobResult> {
  const todayStr = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });

  const maxSignals = env.CPR_JOURNAL_MAX_SIGNALS;

  // Count all qualifying signals (uncapped) so we can log exactly what the
  // cap below cuts, instead of silently truncating.
  const qualifyingCount = await prisma.scannerResult.count({
    where: {
      date: todayStr,
      score: { gte: 75 },
      NOT: { symbol: { endsWith: ':BSE' } },
    },
  });

  const topSignals = await prisma.scannerResult.findMany({
    where: {
      date: todayStr,
      score: { gte: 75 },
      NOT: { symbol: { endsWith: ':BSE' } },
    },
    orderBy: { score: 'desc' },
    take: maxSignals,
  });

  if (qualifyingCount > topSignals.length) {
    console.log(
      `[CPRJournal] ${qualifyingCount - topSignals.length} qualifying signal(s) cut by ` +
      `CPR_JOURNAL_MAX_SIGNALS=${maxSignals} (${qualifyingCount} qualified today)`
    );
  }

  if (topSignals.length === 0) {
    return {
      success: false,
      logged: [],
      skipped: [],
      message: 'No CPR signals with score >= 75 today',
    };
  }

  const logged: string[] = [];
  const skipped: string[] = [];

  for (const signal of topSignals) {
    // Sanitize once up front so the symbol used to fetch the option
    // suggestion (and thus the prefix baked into formattedName) matches the
    // symbol used to strip that prefix back off below. The DB query already
    // excludes ':BSE' symbols as defense in depth, but this must not rely
    // on that filter to stay correct.
    const cleanSym = signal.symbol.split(':')[0].trim();

    // Entry is the LONG breakout-continuation trigger (tomorrow's projected TC,
    // see scanner.service.ts entry = cprTomorrow.tc). If price hasn't reached it
    // yet, this signal was never actually triggerable — don't fabricate a fill.
    if (signal.ltp < signal.entry) {
      console.log(
        `[CPRJournal] ${signal.symbol} not triggered: LTP ${signal.ltp} < Entry ${signal.entry}`
      );
      skipped.push(signal.symbol);
      continue;
    }

    // SECTOR_DIVERGENCE is baked into signalSummary by SectorRegimeService at
    // scan time. In live mode, skip journaling — the stock's own sector was
    // net-bearish that day. Shadow mode logs only, never blocks.
    const hasSectorDivergence = signal.signalSummary?.includes('SECTOR_DIVERGENCE') ?? false;
    if (hasSectorDivergence && env.SECTOR_FILTER_MODE === 'live') {
      console.log(`[CPRJournal] ${signal.symbol} skipped: sector divergence (live mode)`);
      skipped.push(signal.symbol);
      continue;
    }

    const suggestion = await OptionSuggestionService.suggestOptionForBtst(
      cleanSym,
      signal.ltp,
      'LONG',
      signal.entry,
      signal.sl,
      signal.target,
      todayStr
    );

    if (suggestion.error || !suggestion.strike || !suggestion.ltp) {
      console.warn(
        `[CPRJournal] No option suggestion for ${signal.symbol}: ` +
        (suggestion.error ?? 'missing strike or ltp')
      );
      skipped.push(signal.symbol);
      continue;
    }

    const optionName =
      suggestion.formattedName?.replace(new RegExp(`^${cleanSym}\\s+`), '') ||
      `${suggestion.strike} CE`;

    const didLog = await TradeJournalService.logSignal({
      signalType: 'CPR',
      symbol: signal.symbol,
      optionContract: optionName,
      optionStrike: suggestion.strike,
      optionType: 'CE',
      entryCmp: suggestion.ltp,
      score: signal.score,
      confidence: signal.confidence,
      signalSummary: signal.signalSummary,
    });

    if (didLog) logged.push(signal.symbol);
    else skipped.push(signal.symbol);
  }

  return { success: logged.length > 0, logged, skipped };
}
