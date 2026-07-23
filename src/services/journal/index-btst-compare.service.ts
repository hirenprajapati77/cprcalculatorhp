import { prisma } from '@/lib/db';
import { getISTDateString } from '@/lib/market-hours';
import { parseIndexBtstTradeContext } from '../backtest/index-btst-slice-metrics';

export interface IndexBtstCompareRow {
  symbol: string;
  signalDate: string;
  live: {
    id: string;
    score: number;
    classification: string | null;
    optionContract: string;
    entryCmp: number;
    exitCmp: number | null;
    pnlPct: number | null;
    regime: string | null;
    matched: boolean;
  } | null;
  backtest: {
    id: string;
    score: number;
    classification: string | null;
    spotPnlPct: number | null;
    status: string;
    exitReason: string | null;
    vixBand: string | null;
    regimeTrend: string | null;
    matched: boolean;
  } | null;
  alignment: 'BOTH' | 'LIVE_ONLY' | 'BACKTEST_ONLY';
}

export interface IndexBtstCompareResult {
  backtestRunId: string | null;
  backtestRunName: string | null;
  backtestWindow: { start: string; end: string } | null;
  rows: IndexBtstCompareRow[];
  summary: {
    matchedDays: number;
    liveOnly: number;
    backtestOnly: number;
    liveClosed: number;
    liveWinRate: number | null;
    backtestWinRate: number | null;
  };
}

function journalDateKey(tradeDate: Date): string {
  return getISTDateString(tradeDate);
}

function backtestDateKey(entryDate: Date): string {
  return getISTDateString(entryDate);
}

function parseClassification(signalSummary: string): string | null {
  const first = signalSummary.split(',')[0]?.trim();
  return first || null;
}

function parseRegimeFromSummary(signalSummary: string): string | null {
  const part = signalSummary.split(',').find((p) => p.trim().startsWith('REGIME_'));
  return part ? part.trim().replace('REGIME_', '') : null;
}

async function resolveBacktestRun(backtestRunId?: string) {
  if (backtestRunId) {
    return prisma.backtestRun.findUnique({ where: { id: backtestRunId } });
  }
  return prisma.backtestRun.findFirst({
    where: { strategyMode: 'INDEX_BTST_DRIVEN', status: 'COMPLETED' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getIndexBtstCompare(
  backtestRunId?: string
): Promise<IndexBtstCompareResult> {
  const run = await resolveBacktestRun(backtestRunId);

  const liveEntries = await prisma.tradeJournal.findMany({
    where: {
      signalType: 'BTST',
      signalSummary: { contains: 'INDEX' },
    },
    orderBy: { tradeDate: 'desc' },
    take: 200,
  });

  const backtestTrades = run
    ? await prisma.trade.findMany({
        where: {
          backtestRunId: run.id,
          strategyMode: 'INDEX_BTST_DRIVEN',
        },
        orderBy: { entryDate: 'asc' },
      })
    : [];

  const liveByKey = new Map<string, (typeof liveEntries)[number]>();
  for (const e of liveEntries) {
    liveByKey.set(`${e.symbol}_${journalDateKey(e.tradeDate)}`, e);
  }

  const btByKey = new Map<string, (typeof backtestTrades)[number]>();
  for (const t of backtestTrades) {
    btByKey.set(`${t.symbol}_${backtestDateKey(t.entryDate)}`, t);
  }

  const allKeys = new Set([...liveByKey.keys(), ...btByKey.keys()]);
  const rows: IndexBtstCompareRow[] = [];

  for (const key of [...allKeys].sort().reverse()) {
    const sep = key.indexOf('_');
    const symbol = key.slice(0, sep);
    const signalDate = key.slice(sep + 1);
    const live = liveByKey.get(key) ?? null;
    const bt = btByKey.get(key) ?? null;

    let alignment: IndexBtstCompareRow['alignment'];
    if (live && bt) alignment = 'BOTH';
    else if (live) alignment = 'LIVE_ONLY';
    else alignment = 'BACKTEST_ONLY';

    const ctx = bt ? parseIndexBtstTradeContext(bt.signalsJson) : {};

    rows.push({
      symbol,
      signalDate,
      live: live
        ? {
            id: live.id,
            score: live.score,
            classification: parseClassification(live.signalSummary),
            optionContract: live.optionContract,
            entryCmp: live.entryCmp,
            exitCmp: live.exitCmp,
            pnlPct: live.pnlPct,
            regime:
              live.regimeSnapshotAtSignal ??
              parseRegimeFromSummary(live.signalSummary),
            matched: !!bt,
          }
        : null,
      backtest: bt
        ? {
            id: bt.id,
            score: bt.score ?? 0,
            classification: ctx.classification ?? null,
            spotPnlPct: bt.pnlPercent,
            status: bt.status,
            exitReason: bt.exitReason,
            vixBand: ctx.vixBand ?? null,
            regimeTrend: ctx.regimeTrend ?? null,
            matched: !!live,
          }
        : null,
      alignment,
    });
  }

  const liveClosed = liveEntries.filter((e) => e.exitCmp != null);
  const liveWins = liveClosed.filter((e) => (e.pnlPct ?? 0) > 0).length;
  const btClosed = backtestTrades.filter(
    (t) => t.status !== 'OPEN' && t.status !== 'NEVER_TRIGGERED'
  );
  const btWins = btClosed.filter((t) => (t.pnl ?? 0) > 0).length;

  return {
    backtestRunId: run?.id ?? null,
    backtestRunName: run?.name ?? null,
    backtestWindow: run
      ? {
          start: getISTDateString(run.startDate),
          end: getISTDateString(run.endDate),
        }
      : null,
    rows,
    summary: {
      matchedDays: rows.filter((r) => r.alignment === 'BOTH').length,
      liveOnly: rows.filter((r) => r.alignment === 'LIVE_ONLY').length,
      backtestOnly: rows.filter((r) => r.alignment === 'BACKTEST_ONLY').length,
      liveClosed: liveClosed.length,
      liveWinRate:
        liveClosed.length > 0 ? (liveWins / liveClosed.length) * 100 : null,
      backtestWinRate:
        btClosed.length > 0 ? (btWins / btClosed.length) * 100 : null,
    },
  };
}
