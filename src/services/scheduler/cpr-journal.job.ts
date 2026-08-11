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
 * Infer CPR journal direction from persisted ScannerResult levels.
 * TC entry → LONG, BC entry → SHORT, RANGE (pivot) → SL/target geometry
 * (sl > entry or target < entry → SHORT). Legacy entry≤0 → LONG.
 */
export function inferCprJournalDirection(signal: {
  entry: number | null;
  bc: number | null;
  tc: number | null;
  sl: number | null;
  target: number | null;
}): 'LONG' | 'SHORT' {
  const entry = signal.entry ?? 0;
  if (entry <= 0) return 'LONG';

  const bc = signal.bc ?? 0;
  const tc = signal.tc ?? 0;

  // Bias branch pins entry to today's TC (bullish) or BC (bearish).
  // tc/bc/entry are toFixed(2) from the same raw cprToday value.
  if (entry === bc && bc !== tc) return 'SHORT';
  if (entry === tc && bc !== tc) return 'LONG';

  // RANGE: entry = pivot. Short mean-revert has SL above entry / target below.
  const sl = signal.sl;
  if (sl != null && sl > entry) return 'SHORT';
  const target = signal.target;
  if (target != null && target < entry) return 'SHORT';
  return 'LONG';
}

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

    const tag = inferCprJournalDirection(signal);
    const isBearish = tag === 'SHORT';

    // Entry is the breakout-continuation / mean-revert trigger.
    // Bullish must hold ABOVE entry; bearish must hold BELOW entry.
    const triggered = isBearish ? signal.ltp <= signal.entry : signal.ltp >= signal.entry;
    if (!triggered) {
      console.log(
        `[CPRJournal] ${signal.symbol} not triggered: LTP ${signal.ltp} vs Entry ${signal.entry} (${tag})`
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

    const fallbackOptionType = isBearish ? 'PE' : 'CE';
    let optionName: string;
    let optionStrike: number;
    let optionType: 'CE' | 'PE';
    let entryCmp: number;

    try {
      const suggestion = await OptionSuggestionService.suggestOptionForBtst(
        cleanSym,
        signal.ltp,
        tag,
        signal.entry,
        signal.sl,
        signal.target,
        todayStr
      );

      if (!suggestion.error && suggestion.strike && suggestion.ltp) {
        optionType = suggestion.type ?? fallbackOptionType;
        optionName =
          suggestion.formattedName?.replace(new RegExp(`^${cleanSym}\\s+`), '') ||
          `${suggestion.strike} ${optionType}`;
        optionStrike = suggestion.strike;
        entryCmp = suggestion.ltp;
      } else {
        console.warn(
          `[CPRJournal] No option suggestion for ${signal.symbol}: ` +
          (suggestion.error ?? 'missing strike or ltp') +
          ' — journaling UNDERLYING stock LTP.'
        );
        optionType = fallbackOptionType;
        optionName = TradeJournalService.underlyingOptionContract(optionType);
        optionStrike = 0;
        entryCmp = signal.ltp;
      }
    } catch (optErr) {
      console.warn(
        `[CPRJournal] Option lookup threw for ${signal.symbol}:`,
        optErr,
        '— journaling UNDERLYING stock LTP.'
      );
      optionType = fallbackOptionType;
      optionName = TradeJournalService.underlyingOptionContract(optionType);
      optionStrike = 0;
      entryCmp = signal.ltp;
    }

    const didLog = await TradeJournalService.logSignal({
      signalType: 'CPR',
      symbol: signal.symbol,
      optionContract: optionName,
      optionStrike,
      optionType,
      entryCmp,
      score: signal.score,
      confidence: signal.confidence,
      signalSummary: signal.signalSummary,
    });

    if (didLog) logged.push(signal.symbol);
    else skipped.push(signal.symbol);
  }

  return { success: logged.length > 0, logged, skipped };
}
