import { prisma } from '@/lib/db';
import { OptionSuggestionService } from '@/services/option-suggestion.service';
import { TradeJournalService } from '@/services/journal/trade-journal.service';

export type CprJournalJobResult = {
  success: boolean;
  logged: string[];
  skipped: string[];
  message?: string;
};

/** Shared CPR journal pipeline for cron route and in-process scheduler. */
export async function runCprJournalJob(): Promise<CprJournalJobResult> {
  const todayStr = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });

  const topSignals = await prisma.scannerResult.findMany({
    where: {
      date: todayStr,
      score: { gte: 75 },
    },
    orderBy: { score: 'desc' },
    take: 2,
  });

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
    const suggestion = await OptionSuggestionService.suggestOptionForBtst(
      signal.symbol,
      signal.ltp,
      'LONG',
      signal.entry,
      signal.sl,
      signal.target
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
      suggestion.formattedName?.replace(new RegExp(`^${signal.symbol}\\s+`), '') ||
      `${suggestion.strike} CE`;

    const didLog = await TradeJournalService.logSignal({
      signalType: 'CPR',
      symbol: signal.symbol,
      optionContract: optionName,
      optionStrike: suggestion.strike,
      optionType: 'CE',
      score: signal.score,
      confidence: signal.confidence,
      signalSummary: signal.signalSummary,
    });

    if (didLog) logged.push(signal.symbol);
    else skipped.push(signal.symbol);
  }

  return { success: logged.length > 0, logged, skipped };
}
