import type { OvernightSignal } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { IndexSignalResult } from './index-discover.service';
import { IndexDiscoverService } from './index-discover.service';
import { INDEX_SCORE } from './index-ranking.service';
import {
  compareLatestScanRows,
  distinctLatestScanBySymbol,
} from './overnight-ui-adapter';

const INDEX_LONG_READY = ['INDEX_STRONG', 'INDEX_READY'] as const;

/** Map index classification to journal-quality bucket (mirrors stock TRADEABLE gating). */
export function indexClassificationToQualityBucket(
  classification: string
): string | null {
  if (classification === 'INDEX_STRONG' || classification === 'INDEX_READY') {
    return 'TRADEABLE';
  }
  if (classification === 'INDEX_WATCH') {
    return 'WATCHLIST';
  }
  if (classification === 'IGNORE') {
    return 'LOW_QUALITY';
  }
  return null;
}

/** Upsert index BTST discover rows into OvernightSignal for journal / history. */
export async function persistIndexBtstOvernightSignals(
  results: IndexSignalResult[]
): Promise<void> {
  for (const r of results) {
    const qualityBucket = indexClassificationToQualityBucket(r.classification);
    await prisma.overnightSignal.upsert({
      where: {
        symbol_signalDate_signalTime: {
          symbol: r.symbol,
          signalDate: r.signalDate,
          signalTime: r.signalTime,
        },
      },
      update: {
        direction: r.direction,
        entry: r.entry,
        stopLoss: r.stopLoss,
        target: r.target,
        overnightScore: r.score,
        confidence: r.confidence ?? r.score ?? 0,
        classification: r.classification,
        instrumentType: 'INDEX',
        qualityBucket,
        exitStrategy: 'EOD',
      },
      create: {
        symbol: r.symbol,
        signalDate: r.signalDate,
        signalTime: r.signalTime,
        direction: r.direction,
        entry: r.entry,
        stopLoss: r.stopLoss,
        target: r.target,
        overnightScore: r.score,
        confidence: r.confidence ?? r.score ?? 0,
        classification: r.classification,
        instrumentType: 'INDEX',
        qualityBucket,
        exitStrategy: 'EOD',
      },
    });
  }
}

/**
 * Journal-aligned index BTST picks: INDEX_STRONG/INDEX_READY + READY+ score floor.
 * Index rows use INDEX_* classifications (never stock STRONG_BTST/BTST_READY).
 */
export function selectTradableIndexBtstPicks(
  signals: OvernightSignal[],
  opts: {
    minScore?: number;
    take?: number;
    suppressLong?: boolean;
  } = {}
) {
  const minScore = opts.minScore ?? INDEX_SCORE.READY;
  const take = opts.take ?? 2;

  if (opts.suppressLong) {
    return [];
  }

  return distinctLatestScanBySymbol(
    signals
      .filter(
        (s) =>
          s.direction === 'LONG' &&
          s.instrumentType === 'INDEX' &&
          INDEX_LONG_READY.includes(
            s.classification as (typeof INDEX_LONG_READY)[number]
          ) &&
          (s.overnightScore ?? 0) >= minScore &&
          s.entry != null &&
          s.entry > 0 &&
          s.stopLoss != null &&
          s.target != null
      )
      .sort(compareLatestScanRows)
  ).slice(0, take);
}

export type IndexBtstJournalResult = {
  logged: string[];
  skipped: string[];
  picks: OvernightSignal[];
};

/**
 * Refresh index BTST discover, select READY+ picks, and log CE entries to TradeJournal.
 * Runs even when the stock overnight pipeline has no tradable setups.
 */
export async function logIndexBtstJournalEntries(params: {
  signalDate: string;
  suppressLong: boolean;
  regimeTrend: string;
}): Promise<IndexBtstJournalResult> {
  const { signalDate, suppressLong, regimeTrend } = params;
  const logged: string[] = [];
  const skipped: string[] = [];

  console.log(`[BtstJournal] Refreshing Index BTST OvernightSignal for ${signalDate}.`);
  const indexDiscoverResults = await IndexDiscoverService.discover();
  await persistIndexBtstOvernightSignals(indexDiscoverResults);

  const indexSignals = await prisma.overnightSignal.findMany({
    where: { signalDate, instrumentType: 'INDEX' },
    orderBy: [{ signalTime: 'desc' }, { overnightScore: 'desc' }],
  });

  const picks = selectTradableIndexBtstPicks(indexSignals, {
    minScore: INDEX_SCORE.READY,
    take: 2,
    suppressLong,
  });

  const { OptionSuggestionService } = await import('@/services/option-suggestion.service');
  const { TradeJournalService } = await import('@/services/journal/trade-journal.service');

  for (const signal of picks) {
    const entry = signal.entry ?? 0;
    const sl = signal.stopLoss ?? entry * 0.98;
    const target = signal.target ?? entry * 1.04;

    if (!entry || entry <= 0) {
      console.warn(`[BtstJournal] No entry for index ${signal.symbol}; skipping`);
      skipped.push(`${signal.symbol}:INDEX_BTST`);
      continue;
    }

    const suggestion = await OptionSuggestionService.suggestOptionForBtst(
      signal.symbol,
      entry,
      'LONG',
      entry,
      sl,
      target
    );

    if (suggestion.error || !suggestion.strike || !suggestion.ltp) {
      console.warn(
        `[BtstJournal] No index CE suggestion for ${signal.symbol}: ` +
        (suggestion.error ?? 'missing strike or ltp')
      );
      skipped.push(`${signal.symbol}:INDEX_BTST`);
      continue;
    }

    const optionName =
      suggestion.formattedName?.replace(new RegExp(`^${signal.symbol}\\s+`), '') ||
      `${suggestion.strike} CE`;
    const signalSummary = [
      signal.classification,
      signal.qualityBucket,
      signal.direction,
      'INDEX',
      `REGIME_${regimeTrend}`,
    ]
      .filter(Boolean)
      .join(',');

    const didLog = await TradeJournalService.logSignal({
      signalType: 'BTST',
      symbol: signal.symbol,
      optionContract: optionName,
      optionStrike: suggestion.strike,
      optionType: 'CE',
      score: signal.overnightScore ?? 0,
      confidence: signal.confidence ?? signal.overnightScore ?? 0,
      signalSummary,
      overnightSignalId: signal.id,
    });

    if (didLog) logged.push(`${signal.symbol}:INDEX_BTST`);
    else skipped.push(`${signal.symbol}:INDEX_BTST`);
  }

  return { logged, skipped, picks };
}
